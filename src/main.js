import './style.css';
import { CuraWASM } from 'cura-wasm';
import { Viewer } from './viewer.js';
import { buildLk4ProDefinition, LK4_PRO_LIMITS } from './lk4pro.definition.js';

// --- Elementos ---
const el = (id) => document.getElementById(id);
const dropzone = el('dropzone');
const fileInput = el('fileInput');
const modelInfo = el('modelInfo');
const sliceBtn = el('sliceBtn');
const progressRow = el('progressRow');
const progressFill = el('progressFill');
const progressLabel = el('progressLabel');
const resultRow = el('resultRow');
const resultStats = el('resultStats');
const downloadBtn = el('downloadBtn');
const sendMainsailBtn = el('sendMainsailBtn');
const mainsailHost = el('mainsailHost');
const statusMessage = el('statusMessage');
const engineDot = el('engineDot');
const engineStatusText = el('engineStatusText');
const infillDensity = el('infillDensity');
const infillDensityOut = el('infillDensityOut');
const qualityPreset = el('qualityPreset');
const layerHeightInput = el('layerHeight');

const QUALITY_PRESETS = {
  draft: 0.28,
  standard: 0.2,
  fine: 0.12
};

let currentModel = null; // ArrayBuffer
let currentModelExt = 'stl'; // 'stl' | '3mf'
let currentGcode = null; // ArrayBuffer
let currentGcodeName = 'model.gcode';

// Guarda o host do Mainsail entre sessões (localStorage é só configuração local do browser, não é persistência de dados sensíveis)
mainsailHost.value = localStorage.getItem('lk4pro:mainsailHost') || '';

// --- Viewer 3D ---
const viewport = document.getElementById('viewport');
const viewer = new Viewer(viewport);

// --- Drag & drop / seleção de ficheiro ---
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

async function handleFile(file) {
  const match = file.name.toLowerCase().match(/\.(stl|3mf)$/);
  if (!match) {
    setStatus('Só ficheiros .stl ou .3mf são suportados por agora.', true);
    return;
  }
  const ext = match[1];
  setStatus(`A carregar ${file.name}…`);
  const buffer = await file.arrayBuffer();
  currentGcodeName = file.name.replace(/\.(stl|3mf)$/i, '.gcode');

  try {
    const dims = await viewer.loadModel(buffer.slice(0), ext);
    currentModel = dims.sliceBuffer;
    currentModelExt = dims.sliceExt;
    dropzone.classList.add('hidden');
    modelInfo.hidden = false;
    modelInfo.innerHTML = `<strong>${file.name}</strong><br/>${dims.x.toFixed(1)} × ${dims.y.toFixed(1)} × ${dims.z.toFixed(1)} mm`;

    if (dims.x > LK4_PRO_LIMITS.bedWidth || dims.y > LK4_PRO_LIMITS.bedDepth || dims.z > LK4_PRO_LIMITS.maxHeight) {
      setStatus('Atenção: o modelo excede o volume de impressão da LK4 Pro (220×220×250mm).', true);
    } else {
      setStatus('Modelo carregado. Ajusta as definições e fatia.');
    }
    sliceBtn.disabled = false;
    resultRow.hidden = true;
  } catch (err) {
    console.error(err);
    setStatus(`Não foi possível ler este ${ext.toUpperCase()}.`, true);
  }
}

// --- Presets de qualidade ---
qualityPreset.addEventListener('change', () => {
  const preset = qualityPreset.value;
  if (QUALITY_PRESETS[preset] != null) {
    layerHeightInput.value = QUALITY_PRESETS[preset];
  }
});
layerHeightInput.addEventListener('input', () => { qualityPreset.value = 'custom'; });

infillDensity.addEventListener('input', () => { infillDensityOut.textContent = `${infillDensity.value}%`; });

// --- Motor CuraEngine (WASM) ---
let slicer = null;
let slicerKlipperMode = null;

function getSlicer(useKlipperMacros) {
  // Recria o slicer só se o modo de G-code mudou (a definição da impressora está embutida no slicer)
  if (slicer == null || slicerKlipperMode !== useKlipperMacros) {
    setEngineStatus('idle', 'motor por iniciar');
    slicer = new CuraWASM({
      definition: buildLk4ProDefinition(useKlipperMacros),
      overrides: [],
      verbose: false
    });
    slicerKlipperMode = useKlipperMacros;
  }
  return slicer;
}

function buildOverrides() {
  const overrides = [];
  const add = (key, value, scope) => overrides.push(scope ? { scope, key, value } : { key, value });

  add('layer_height', Number(el('layerHeight').value));
  add('wall_thickness', Number(el('wallThickness').value));
  add('infill_sparse_density', Number(el('infillDensity').value));
  add('infill_pattern', `'${el('infillPattern').value}'`);
  add('speed_print', Number(el('printSpeed').value));
  add('support_enable', el('supportEnable').checked ? 'True' : 'False');
  add('adhesion_type', `'${el('adhesionType').value}'`);

  // Temperaturas — aplicadas ao material do extruder 0
  add('material_print_temperature', Number(el('printTemp').value), 'e0');
  add('material_print_temperature_layer_0', Number(el('printTemp').value) + 5, 'e0');
  add('material_bed_temperature', Number(el('bedTemp').value));
  add('material_bed_temperature_layer_0', Number(el('bedTemp').value) + 5);

  return overrides;
}

sliceBtn.addEventListener('click', async () => {
  if (!currentModel) return;

  const printTemp = Number(el('printTemp').value);
  const bedTemp = Number(el('bedTemp').value);
  if (printTemp > LK4_PRO_LIMITS.maxNozzleTemp || bedTemp > LK4_PRO_LIMITS.maxBedTemp) {
    setStatus(`Temperaturas acima do limite da LK4 Pro (bico ≤ ${LK4_PRO_LIMITS.maxNozzleTemp}°C, cama ≤ ${LK4_PRO_LIMITS.maxBedTemp}°C).`, true);
    return;
  }

  sliceBtn.disabled = true;
  resultRow.hidden = true;
  progressRow.hidden = false;
  progressFill.style.width = '0%';
  progressLabel.textContent = '0%';
  setEngineStatus('busy', 'a inicializar motor…');
  setStatus('A fatiar — a primeira vez demora mais tempo (carrega o WASM).');

  try {
    const useKlipperMacros = el('useKlipperMacros').checked;
    const engine = getSlicer(useKlipperMacros);
    engine.removeAllListeners('progress');
    engine.on('progress', (p) => {
      progressFill.style.width = `${p}%`;
      progressLabel.textContent = `${p}%`;
      setEngineStatus('busy', `a fatiar… ${p}%`);
    });

    engine['config'].overrides = buildOverrides();

    const { gcode, metadata } = await engine.slice(currentModel.slice(0), currentModelExt);
    currentGcode = gcode;

    setEngineStatus('ready', 'motor pronto');
    progressRow.hidden = true;
    resultRow.hidden = false;

    const timeMin = metadata ? Math.round(metadata.printTime / 60) : null;
    const filamentM = metadata ? (metadata.filamentUsage / 1000).toFixed(2) : null;
    resultStats.innerHTML = timeMin != null
      ? `Tempo estimado: <strong>${formatDuration(timeMin)}</strong><br/>Filamento: <strong>${filamentM} m</strong>`
      : 'Fatiado com sucesso.';

    setStatus(`Pronto: ${currentGcodeName}`);
  } catch (err) {
    console.error(err);
    setEngineStatus('error', 'erro no motor');
    progressRow.hidden = true;
    setStatus(`Erro ao fatiar: ${err.message || err}`, true);
  } finally {
    sliceBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!currentGcode) return;
  const blob = new Blob([currentGcode], { type: 'text/x-gcode' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentGcodeName;
  a.click();
  URL.revokeObjectURL(url);
});

// --- Envio direto para o Mainsail/Moonraker ---
mainsailHost.addEventListener('change', () => {
  localStorage.setItem('lk4pro:mainsailHost', mainsailHost.value.trim());
});

sendMainsailBtn.addEventListener('click', async () => {
  if (!currentGcode) return;
  const host = mainsailHost.value.trim();
  if (!host) {
    setStatus('Indica o IP ou hostname do Mainsail (ex: 192.168.1.222).', true);
    return;
  }

  const base = host.startsWith('http') ? host : `http://${host}`;
  setStatus(`A enviar ${currentGcodeName} para ${base}…`);
  sendMainsailBtn.disabled = true;

  try {
    const form = new FormData();
    form.append('file', new Blob([currentGcode], { type: 'text/x-gcode' }), currentGcodeName);
    form.append('root', 'gcodes');

    const res = await fetch(`${base}/server/files/upload`, {
      method: 'POST',
      body: form
    });

    if (!res.ok) {
      throw new Error(`Moonraker respondeu ${res.status}`);
    }

    setStatus(`Enviado para o Mainsail (${host}) — disponível na fila de ficheiros.`);
  } catch (err) {
    console.error(err);
    setStatus(
      `Falha ao enviar para o Mainsail: ${err.message}. Confirma o IP, que está na mesma rede, e que o CORS está permitido em moonraker.conf ([authorization] cors_domains).`,
      true
    );
  } finally {
    sendMainsailBtn.disabled = false;
  }
});

// --- Utilitários de UI ---
function setStatus(msg, isError = false) {
  statusMessage.textContent = msg;
  statusMessage.parentElement.classList.toggle('error', isError);
}

function setEngineStatus(state, text) {
  engineDot.className = `dot ${state === 'idle' ? '' : state}`;
  engineStatusText.textContent = text;
}

function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
