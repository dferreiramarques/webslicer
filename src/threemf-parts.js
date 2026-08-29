import * as fflate from 'three/examples/jsm/libs/fflate.module.js';

/**
 * three.js's ThreeMFLoader only resolves <component> references against
 * objects defined in the SAME model part. Slicers that use the 3MF
 * Production Extension (Bambu Studio, OrcaSlicer, newer PrusaSlicer) split
 * each object into its own part under 3D/Objects/*.model and reference it
 * from the root part via a p:path attribute, which the stock loader ignores.
 * That leaves component lookups unresolved and the loader throws trying to
 * read `.mesh` off `undefined`.
 *
 * This merges every <object> from every model part into the root part's
 * <resources> before parsing, so plain objectid lookups succeed regardless
 * of which file originally defined them. Object ids are unique per the 3MF
 * spec, so merging is safe. Single-part files are returned untouched.
 */
export function mergeThreeMFParts(arrayBuffer) {
  let zip;
  try {
    zip = fflate.unzipSync(new Uint8Array(arrayBuffer));
  } catch {
    return arrayBuffer;
  }

  const modelPartNames = Object.keys(zip).filter((f) => /^3D\/.*\.model$/i.test(f));
  if (modelPartNames.length <= 1) return arrayBuffer;

  const relsName = Object.keys(zip).find((f) => /_rels\/\.rels$/i.test(f));
  if (!relsName) return arrayBuffer;

  const decoder = new TextDecoder();
  const parser = new DOMParser();

  try {
    const relsDoc = parser.parseFromString(decoder.decode(zip[relsName]), 'application/xml');
    const rootRel = Array.from(relsDoc.querySelectorAll('Relationship')).find((r) =>
      /\.model$/i.test(r.getAttribute('Target') || '')
    );
    if (!rootRel) return arrayBuffer;

    const rootPath = rootRel.getAttribute('Target').replace(/^\//, '');
    if (!zip[rootPath]) return arrayBuffer;

    const rootDoc = parser.parseFromString(decoder.decode(zip[rootPath]), 'application/xml');
    const rootResources = rootDoc.querySelector('resources');
    if (!rootResources) return arrayBuffer;

    let mergedAny = false;
    for (const partName of modelPartNames) {
      if (partName === rootPath) continue;
      const partDoc = parser.parseFromString(decoder.decode(zip[partName]), 'application/xml');
      partDoc.querySelectorAll('resources > object').forEach((objectNode) => {
        rootResources.appendChild(rootDoc.importNode(objectNode, true));
        mergedAny = true;
      });
      delete zip[partName];
    }

    if (!mergedAny) return arrayBuffer;

    zip[rootPath] = new TextEncoder().encode(new XMLSerializer().serializeToString(rootDoc));

    return fflate.zipSync(zip).buffer;
  } catch {
    return arrayBuffer;
  }
}
