/**
 * Perfis de filamento (material) — globais, não por impressora, à imagem do
 * que qualquer slicer normal faz (o filamento que está na impressora não
 * depende de qual perfil de máquina estás a usar no momento).
 */
const MATERIALS_KEY = 'webslicer:materials';

export const BUILTIN_MATERIALS = [
  { id: 'generic_pla', name: 'PLA Genérico', printTemp: 200, bedTemp: 60 },
  { id: 'generic_petg', name: 'PETG Genérico', printTemp: 240, bedTemp: 80 },
  { id: 'generic_abs', name: 'ABS Genérico', printTemp: 250, bedTemp: 100 },
  { id: 'generic_tpu', name: 'TPU Genérico', printTemp: 220, bedTemp: 50 }
];

export const DEFAULT_MATERIAL_ID = 'generic_pla';

function loadCustomMaterials() {
  try {
    return JSON.parse(localStorage.getItem(MATERIALS_KEY) || '[]');
  } catch {
    return [];
  }
}

function persistCustomMaterials(materials) {
  localStorage.setItem(MATERIALS_KEY, JSON.stringify(materials));
}

export function getAllMaterials() {
  return [...BUILTIN_MATERIALS, ...loadCustomMaterials()];
}

export function getMaterial(id) {
  return getAllMaterials().find((m) => m.id === id);
}

export function isCustomMaterial(id) {
  return !BUILTIN_MATERIALS.some((m) => m.id === id);
}

function validate(name, printTemp, bedTemp) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Indica um nome para o filamento.');
  if (!Number.isFinite(printTemp) || printTemp <= 0) throw new Error('Temperatura do bico inválida.');
  if (!Number.isFinite(bedTemp) || bedTemp < 0) throw new Error('Temperatura da cama inválida.');
  return trimmed;
}

export function addMaterial(name, printTemp, bedTemp) {
  const trimmed = validate(name, printTemp, bedTemp);
  const materials = loadCustomMaterials();
  const id = `material_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const material = { id, name: trimmed, printTemp, bedTemp };
  materials.push(material);
  persistCustomMaterials(materials);
  return material;
}

export function updateMaterial(id, name, printTemp, bedTemp) {
  const trimmed = validate(name, printTemp, bedTemp);
  const materials = loadCustomMaterials();
  const material = materials.find((m) => m.id === id);
  if (!material) throw new Error('Filamento não encontrado.');
  material.name = trimmed;
  material.printTemp = printTemp;
  material.bedTemp = bedTemp;
  persistCustomMaterials(materials);
  return material;
}

export function removeMaterial(id) {
  persistCustomMaterials(loadCustomMaterials().filter((m) => m.id !== id));
}
