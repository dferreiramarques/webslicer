import './style.css';
import { CuraWASM } from 'cura-wasm';
import { Viewer } from './viewer.js';
import {
  DEFAULT_PRINTER_ID,
  KLIPPER_MACRO_SENTINELS,
  getPrinter,
  getAllPrinterEntries,
  addCustomPrinter,
  updateCustomPrinter,
  removeCustomPrinter,
  isCustomPrinter,
  printerToFormData
} from './printers.js';
import { SerialPrinter, isSerialSupported } from './serial-printer.js';

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
const printerSelect = el('printerSelect');
const printerLockHint = el('printerLockHint');
const saveProfileBtn = el('saveProfileBtn');
const resetProfileBtn = el('resetProfileBtn');
const removeCustomPrinterBtn = el('removeCustomPrinterBtn');
const duplicatePrinterBtn = el('duplicatePrinterBtn');
const editCustomPrinterBtn = el('editCustomPrinterBtn');
const addPrinterModal = el('addPrinterModal');
const addPrinterTitle = el('addPrinterTitle');
const newPrinterName = el('newPrinterName');
const newPrinterFirmware = el('newPrinterFirmware');
const newPrinterWidth = el('newPrinterWidth');
const newPrinterDepth = el('newPrinterDepth');
const newPrinterHeight = el('newPrinterHeight');
const newPrinterNozzle = el('newPrinterNozzle');
const newPrinterMaxNozzleTemp = el('newPrinterMaxNozzleTemp');
const newPrinterMaxBedTemp = el('newPrinterMaxBedTemp');
const toggleAdvancedBtn = el('toggleAdvancedBtn');
const advancedSettings = el('advancedSettings');
const newPrinterPrintSpeed = el('newPrinterPrintSpeed');
const newPrinterAcceleration = el('newPrinterAcceleration');
const newPrinterJerk = el('newPrinterJerk');
const newPrinterRetractionDistance = el('newPrinterRetractionDistance');
const newPrinterRetractionSpeed = el('newPrinterRetractionSpeed');
const newPrinterGantryHeight = el('newPrinterGantryHeight');
const addPrinterError = el('addPrinterError');
const cancelAddPrinterBtn = el('cancelAddPrinterBtn');
const confirmAddPrinterBtn = el('confirmAddPrinterBtn');
const materialHeading = el('materialHeading');
const klipperMacrosGroup = el('klipperMacrosGroup');
const printerSubtitle = el('printerSubtitle');
const useKlipperMacrosCheckbox = el('useKlipperMacros');
const printTempInput = el('printTemp');
const bedTempInput = el('bedTemp');
const connectionType = el('connectionType');
const connectionHint = el('connectionHint');
const ipConnectionPanel = el('ipConnectionPanel');
const usbConnectionPanel = el('usbConnectionPanel');
const usbBaudRate = el('usbBaudRate');
const usbConnectBtn = el('usbConnectBtn');
const usbDisconnectBtn = el('usbDisconnectBtn');
const usbStatus = el('usbStatus');
const confirmPrinterBtn = el('confirmPrinterBtn');
const dropzoneText = el('dropzoneText');
const fileGateHint = el('fileGateHint');
const chooseFileBtn = el('chooseFileBtn');
const fileInfoHint = el('fileInfoHint');
const usbPrintBtn = el('usbPrintBtn');
const usbCancelPrintBtn = el('usbCancelPrintBtn');
const usbPrintProgressRow = el('usbPrintProgressRow');
const usbPrintProgressFill = el('usbPrintProgressFill');
const usbPrintProgressLabel = el('usbPrintProgressLabel');

const QUALITY_PRESETS = {
  draft: 0.28,
  standard: 0.2,
  fine: 0.12
};

const GLOBAL_DEFAULTS = {
  wallThickness: 0.8,
  infillDensity: 20,
  infillPattern: 'cubic',
  supportEnable: false,
  adhesionType: 'skirt',
  useKlipperMacros: false
};

const DROPZONE_DEFAULT_HTML = 'Arrasta um <strong>.stl</strong> ou <strong>.3mf</strong> para aqui<br/>ou clica para escolher';
const DROPZONE_LOCKED_HTML = 'Confirma a impressora e a ligação (passo 2)<br/>antes de carregar um ficheiro.';

let printerConfirmed = false;
let currentModel = null; // ArrayBuffer
let currentModelExt = 'stl'; // 'stl' | '3mf'
let currentGcode = null; // ArrayBuffer
let currentGcodeName = 'model.gcode';
let activePrinterId = localStorage.getItem('webslicer:lastPrinter') || DEFAULT_PRINTER_ID;
if (!getPrinter(activePrinterId)) activePrinterId = DEFAULT_PRINTER_ID;

const getActivePrinter = () => getPrinter(activePrinterId);
const profileKey = (printerId) => `webslicer:profile:${printerId}`;
const serialPrinter = new SerialPrinter();

// Guarda o host do Mainsail entre sessões (localStorage é só configuração local do browser, não é persistência de dados sensíveis)
mainsailHost.value = localStorage.getItem('lk4pro:mainsailHost') || '';
usbBaudRate.value = localStorage.getItem('webslicer:usbBaudRate') || '115200';

// --- Viewer 3D ---
const viewport = document.getElementById('viewport');
const viewer = new Viewer(viewport, getActivePrinter().limits);

// --- Seletor de impressora ---
const ADD_PRINTER_OPTION = '__add__';

function renderPrinterOptions() {
  printerSelect.innerHTML = '';
  for (const printer of getAllPrinterEntries()) {
    const option = document.createElement('option');
    option.value = printer.id;
    option.textContent = printer.label;
    printerSelect.appendChild(option);
  }
  const addOption = document.createElement('option');
  addOption.value = ADD_PRINTER_OPTION;
  addOption.textContent = '+ Adicionar impressora…';
  printerSelect.appendChild(addOption);
  printerSelect.value = activePrinterId;
}
renderPrinterOptions();

printerSelect.addEventListener('change', () => {
  if (printerSelect.value === ADD_PRINTER_OPTION) {
    printerSelect.value = activePrinterId;
    openPrinterModal('add');
    return;
  }
  switchPrinter(printerSelect.value);
});

const ADD_PRINTER_FIELD_DEFAULTS = {
  label: '', firmware: 'marlin',
  bedWidth: 220, bedDepth: 220, maxHeight: 250,
  nozzleDiameter: 0.4, maxNozzleTemp: 260, maxBedTemp: 100,
  printSpeed: 50, acceleration: 500, jerkXY: 8,
  retractionDistance: 2, retractionSpeed: 45, gantryHeight: 25
};

// 'add' | 'edit' | 'duplicate' — 'edit' guarda por cima do id em editingPrinterId,
// os outros dois criam sempre uma impressora nova.
let modalMode = 'add';
let editingPrinterId = null;

function fillPrinterForm(data) {
  newPrinterName.value = data.label;
  newPrinterFirmware.value = data.firmware;
  newPrinterWidth.value = data.bedWidth;
  newPrinterDepth.value = data.bedDepth;
  newPrinterHeight.value = data.maxHeight;
  newPrinterNozzle.value = data.nozzleDiameter;
  newPrinterMaxNozzleTemp.value = data.maxNozzleTemp;
  newPrinterMaxBedTemp.value = data.maxBedTemp;
  newPrinterPrintSpeed.value = data.printSpeed;
  newPrinterAcceleration.value = data.acceleration;
  newPrinterJerk.value = data.jerkXY;
  newPrinterRetractionDistance.value = data.retractionDistance;
  newPrinterRetractionSpeed.value = data.retractionSpeed;
  newPrinterGantryHeight.value = data.gantryHeight;
}

function setAdvancedExpanded(expanded) {
  advancedSettings.hidden = !expanded;
  toggleAdvancedBtn.setAttribute('aria-expanded', String(expanded));
  toggleAdvancedBtn.textContent = expanded ? 'Definições avançadas ▴' : 'Definições avançadas ▾';
}

toggleAdvancedBtn.addEventListener('click', () => setAdvancedExpanded(advancedSettings.hidden));

/**
 * Abre o assistente da impressora.
 * mode 'add': campos em branco/predefinidos.
 * mode 'edit': pré-preenchido com a impressora personalizada indicada, guarda por cima do mesmo id.
 * mode 'duplicate': pré-preenchido com QUALQUER impressora (embutida ou personalizada), cria sempre uma nova.
 */
function openPrinterModal(mode, sourcePrinter) {
  modalMode = mode;
  editingPrinterId = mode === 'edit' ? sourcePrinter.id : null;

  if (sourcePrinter) {
    const data = printerToFormData(sourcePrinter);
    if (mode === 'duplicate') data.label = `${data.label} (cópia)`;
    fillPrinterForm(data);
  } else {
    fillPrinterForm(ADD_PRINTER_FIELD_DEFAULTS);
  }

  addPrinterTitle.textContent = mode === 'edit' ? 'Editar impressora' : 'Adicionar impressora';
  confirmAddPrinterBtn.textContent = mode === 'edit' ? 'Guardar alterações' : 'Adicionar impressora';
  setAdvancedExpanded(false);
  addPrinterError.hidden = true;
  addPrinterModal.hidden = false;
  newPrinterName.focus();
}

function closeAddPrinterModal() {
  addPrinterModal.hidden = true;
}

cancelAddPrinterBtn.addEventListener('click', closeAddPrinterModal);
addPrinterModal.addEventListener('click', (e) => {
  if (e.target === addPrinterModal) closeAddPrinterModal();
});

duplicatePrinterBtn.addEventListener('click', () => openPrinterModal('duplicate', getActivePrinter()));

editCustomPrinterBtn.addEventListener('click', () => {
  const printer = getActivePrinter();
  if (!printer || !isCustomPrinter(printer.id)) return;
  openPrinterModal('edit', printer);
});

confirmAddPrinterBtn.addEventListener('click', () => {
  const form = {
    label: newPrinterName.value,
    firmware: newPrinterFirmware.value,
    bedWidth: newPrinterWidth.value,
    bedDepth: newPrinterDepth.value,
    maxHeight: newPrinterHeight.value,
    nozzleDiameter: newPrinterNozzle.value,
    maxNozzleTemp: newPrinterMaxNozzleTemp.value,
    maxBedTemp: newPrinterMaxBedTemp.value,
    printSpeed: newPrinterPrintSpeed.value,
    acceleration: newPrinterAcceleration.value,
    jerkXY: newPrinterJerk.value,
    retractionDistance: newPrinterRetractionDistance.value,
    retractionSpeed: newPrinterRetractionSpeed.value,
    gantryHeight: newPrinterGantryHeight.value
  };

  const isEdit = modalMode === 'edit';

  // Editar a impressora já ativa não passa pelo aviso de switchPrinter (o id
  // não muda), mas a reaplicação abaixo limpa o modelo à mesma — avisa aqui.
  if (isEdit && editingPrinterId === activePrinterId && currentModel) {
    const proceed = window.confirm(
      'Guardar estas alterações vai limpar o modelo carregado — vais ter de o voltar a importar. Continuar?'
    );
    if (!proceed) return;
  }

  try {
    const printer = isEdit ? updateCustomPrinter(editingPrinterId, form) : addCustomPrinter(form);
    closeAddPrinterModal();
    renderPrinterOptions();
    switchPrinter(printer.id);
    setStatus(isEdit ? `Impressora "${printer.label}" atualizada.` : `Impressora "${printer.label}" adicionada.`);
  } catch (err) {
    addPrinterError.textContent = err.message;
    addPrinterError.hidden = false;
  }
});

removeCustomPrinterBtn.addEventListener('click', () => {
  const printer = getActivePrinter();
  if (!printer || !isCustomPrinter(printer.id)) return;
  if (!window.confirm(`Remover a impressora "${printer.label}"? Isto também apaga o perfil guardado para ela.`)) return;
  removeCustomPrinter(printer.id);
  localStorage.removeItem(profileKey(printer.id));
  renderPrinterOptions();
  switchPrinter(DEFAULT_PRINTER_ID);
});

function collectProfile() {
  return {
    qualityPreset: qualityPreset.value,
    layerHeight: Number(layerHeightInput.value),
    wallThickness: Number(el('wallThickness').value),
    infillDensity: Number(infillDensity.value),
    infillPattern: el('infillPattern').value,
    printTemp: Number(printTempInput.value),
    bedTemp: Number(bedTempInput.value),
    printSpeed: Number(el('printSpeed').value),
    supportEnable: el('supportEnable').checked,
    adhesionType: el('adhesionType').value,
    useKlipperMacros: useKlipperMacrosCheckbox.checked
  };
}

function applyProfile(profile) {
  layerHeightInput.value = profile.layerHeight;
  qualityPreset.value = profile.qualityPreset ?? matchQualityPreset(profile.layerHeight);
  el('wallThickness').value = profile.wallThickness;
  infillDensity.value = profile.infillDensity;
  infillDensityOut.textContent = `${profile.infillDensity}%`;
  el('infillPattern').value = profile.infillPattern;
  printTempInput.value = profile.printTemp;
  bedTempInput.value = profile.bedTemp;
  el('printSpeed').value = profile.printSpeed;
  el('supportEnable').checked = profile.supportEnable;
  el('adhesionType').value = profile.adhesionType;
  useKlipperMacrosCheckbox.checked = profile.useKlipperMacros;
}

function matchQualityPreset(layerHeight) {
  const match = Object.entries(QUALITY_PRESETS).find(([, value]) => value === layerHeight);
  return match ? match[0] : 'custom';
}

function defaultProfileFor(printer) {
  return {
    qualityPreset: matchQualityPreset(printer.defaults.layerHeight),
    layerHeight: printer.defaults.layerHeight,
    printTemp: printer.defaults.printTemp,
    bedTemp: printer.defaults.bedTemp,
    printSpeed: printer.defaults.printSpeed,
    ...GLOBAL_DEFAULTS
  };
}

/** Aplica o perfil guardado da impressora, ou as predefinições se não houver nenhum. */
function loadProfileForActivePrinter() {
  const printer = getActivePrinter();
  const saved = localStorage.getItem(profileKey(printer.id));
  const profile = saved ? { ...defaultProfileFor(printer), ...JSON.parse(saved) } : defaultProfileFor(printer);
  applyProfile(profile);
}

// --- Ligação (IP / USB) ---
// Cada impressora só aceita uma via: Klipper fala Moonraker/Mainsail em
// rede, Marlin aceita G-code diretamente por USB. O seletor mostra as duas
// opções mas bloqueia a que não se aplica à impressora escolhida.
function updateConnectionUI(printer) {
  connectionType.value = printer.connection;
  for (const option of connectionType.options) {
    option.disabled = option.value !== printer.connection;
  }
  ipConnectionPanel.hidden = printer.connection !== 'ip';
  usbConnectionPanel.hidden = printer.connection !== 'usb';
  connectionHint.textContent = printer.connection === 'ip'
    ? `A ${printer.label} corre Klipper — liga-se em rede via Moonraker/Mainsail.`
    : `A ${printer.label} corre Marlin — liga-se diretamente por USB (Web Serial).`;
  updatePrintActionVisibility();
}

function updatePrintActionVisibility() {
  const printer = getActivePrinter();
  sendMainsailBtn.hidden = printer.connection !== 'ip';
  usbPrintBtn.hidden = printer.connection !== 'usb';
  usbPrintBtn.disabled = !serialPrinter.connected || !currentGcode;
}

if (!isSerialSupported()) {
  usbConnectBtn.disabled = true;
  usbStatus.textContent = 'O teu browser não suporta ligação USB direta (Web Serial). Usa Chrome ou Edge.';
}

usbConnectBtn.addEventListener('click', async () => {
  usbConnectBtn.disabled = true;
  usbStatus.textContent = 'A ligar…';
  try {
    const baudRate = Number(usbBaudRate.value);
    await serialPrinter.connect(baudRate);
    localStorage.setItem('webslicer:usbBaudRate', usbBaudRate.value);
    onUsbConnected();
  } catch (err) {
    console.error(err);
    usbStatus.textContent = `Falha ao ligar: ${err.message}`;
    usbConnectBtn.disabled = false;
  }
});

usbDisconnectBtn.addEventListener('click', async () => {
  usbDisconnectBtn.disabled = true;
  await serialPrinter.disconnect();
  onUsbDisconnected();
});

function onUsbConnected() {
  usbConnectBtn.hidden = true;
  usbDisconnectBtn.hidden = false;
  usbDisconnectBtn.disabled = false;
  usbBaudRate.disabled = true;
  usbStatus.textContent = 'Ligado.';
  updatePrintActionVisibility();
  updatePrinterLockUI();
}

function onUsbDisconnected() {
  usbConnectBtn.hidden = false;
  usbConnectBtn.disabled = !isSerialSupported();
  usbDisconnectBtn.hidden = true;
  usbBaudRate.disabled = false;
  usbStatus.textContent = 'Não ligado.';
  usbPrintProgressRow.hidden = true;
  usbCancelPrintBtn.hidden = true;
  updatePrintActionVisibility();
  updatePrinterLockUI();
}

// Só se gere uma ligação de cada vez — enquanto a porta USB estiver aberta,
// a impressora fica "reservada" e as outras ficam bloqueadas no seletor,
// para nunca se trocar de perfil a meio de uma impressão em curso (isso
// cortaria a ligação série e deixava a impressão a meio sem aviso).
function updatePrinterLockUI() {
  const locked = serialPrinter.connected;
  printerSelect.disabled = locked;
  printerLockHint.hidden = !locked;
}

// Obriga a confirmar a impressora e a ligação antes de aceitar um ficheiro
// — evita carregar um modelo com uma impressora "por defeito" e só depois
// perceber, ao trocar de impressora, que isso limpa o modelo carregado.
function updateFileGateUI() {
  dropzone.classList.toggle('locked', !printerConfirmed);
  dropzoneText.innerHTML = printerConfirmed ? DROPZONE_DEFAULT_HTML : DROPZONE_LOCKED_HTML;
  chooseFileBtn.disabled = !printerConfirmed;
  fileGateHint.hidden = printerConfirmed;
  fileInfoHint.hidden = !printerConfirmed;
  confirmPrinterBtn.textContent = printerConfirmed ? '✓ Impressora e ligação confirmadas' : 'Confirmar impressora e ligação →';
  confirmPrinterBtn.disabled = printerConfirmed;
}

confirmPrinterBtn.addEventListener('click', () => {
  printerConfirmed = true;
  updateFileGateUI();
  setStatus(`Impressora e ligação confirmadas. Carrega um modelo STL ou 3MF para começar.`);
});

if (isSerialSupported()) {
  navigator.serial.addEventListener('disconnect', () => {
    if (serialPrinter.connected) {
      serialPrinter.disconnect();
      onUsbDisconnected();
      setStatus('A impressora USB foi desligada inesperadamente.', true);
    }
  });
}

/** Troca de impressora ativa: limites, mesa 3D, ligação, motor e perfil guardado. */
function switchPrinter(printerId) {
  if (!getPrinter(printerId)) return;

  // Só se gere uma impressora ligada de cada vez — bloqueia a troca
  // enquanto a impressora atual estiver a ocupar a porta USB (ver
  // updatePrinterLockUI). O <select> já fica disabled nesse estado, isto é
  // só uma segunda barreira caso a troca seja despoletada de outra forma.
  if (serialPrinter.connected && printerId !== activePrinterId) {
    printerSelect.value = activePrinterId;
    setStatus('Desliga a impressora USB atual (passo 2) antes de trocar de impressora.', true);
    return;
  }

  // Trocar de impressora limpa o modelo carregado (mesa/limites diferentes)
  // — avisa antes de destruir trabalho já feito, em vez de o fazer em silêncio.
  if (currentModel && printerId !== activePrinterId) {
    const confirmed = window.confirm(
      'Trocar de impressora vai limpar o modelo carregado — vais ter de o voltar a importar. Continuar?'
    );
    if (!confirmed) {
      printerSelect.value = activePrinterId;
      return;
    }
  }

  activePrinterId = printerId;
  localStorage.setItem('webslicer:lastPrinter', printerId);

  const printer = getActivePrinter();
  printerSelect.value = printer.id;
  printerSubtitle.textContent = printer.label;
  materialHeading.textContent = `Material — ${printer.label} (máx. ${printer.limits.maxNozzleTemp}°C bico / ${printer.limits.maxBedTemp}°C cama)`;
  printTempInput.max = printer.limits.maxNozzleTemp;
  bedTempInput.max = printer.limits.maxBedTemp;
  klipperMacrosGroup.hidden = printer.firmware !== 'klipper';
  removeCustomPrinterBtn.hidden = !isCustomPrinter(printer.id);
  editCustomPrinterBtn.hidden = !isCustomPrinter(printer.id);

  updateConnectionUI(printer);
  loadProfileForActivePrinter();

  // A definição da impressora está embutida no motor — troca de impressora obriga a recriar
  slicer = null;
  slicerKey = null;

  // As posições/limites do modelo carregado eram relativos à mesa anterior
  viewer.clearModel();
  viewer.setLimits(printer.limits);
  currentModel = null;
  currentGcode = null;
  dropzone.classList.remove('hidden');
  modelInfo.hidden = true;
  fileInfoHint.textContent = 'Nenhum ficheiro carregado.';
  resultRow.hidden = true;
  sliceBtn.disabled = true;

  // Escolher uma impressora no seletor já conta como "confirmar" — o botão
  // de confirmação só é mesmo necessário para quem fica com a predefinição.
  printerConfirmed = true;
  updateFileGateUI();

  setStatus(`Impressora: ${printer.label}. Carrega um modelo STL ou 3MF para começar.`);
}

saveProfileBtn.addEventListener('click', () => {
  const printer = getActivePrinter();
  localStorage.setItem(profileKey(printer.id), JSON.stringify(collectProfile()));
  setStatus(`Perfil da ${printer.label} guardado para uso futuro.`);
});

resetProfileBtn.addEventListener('click', () => {
  const printer = getActivePrinter();
  localStorage.removeItem(profileKey(printer.id));
  applyProfile(defaultProfileFor(printer));
  setStatus(`Definições da ${printer.label} repostas para as predefinições.`);
});

// --- Drag & drop / seleção de ficheiro ---
dropzone.addEventListener('click', () => fileInput.click());
chooseFileBtn.addEventListener('click', () => fileInput.click());
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
  if (!printerConfirmed) {
    setStatus('Confirma a impressora e a ligação (passo 2) antes de carregar um ficheiro.', true);
    return;
  }
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
    const dimsText = `${dims.x.toFixed(1)} × ${dims.y.toFixed(1)} × ${dims.z.toFixed(1)} mm`;
    modelInfo.innerHTML = `<strong>${file.name}</strong><br/>${dimsText}`;
    fileInfoHint.innerHTML = `<strong>${file.name}</strong><br/>${dimsText}`;

    const limits = getActivePrinter().limits;
    if (dims.x > limits.bedWidth || dims.y > limits.bedDepth || dims.z > limits.maxHeight) {
      setStatus(`Atenção: o modelo excede o volume de impressão da ${getActivePrinter().label} (${limits.bedWidth}×${limits.bedDepth}×${limits.maxHeight}mm).`, true);
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
let slicerKey = null;

function getSlicer(printerId, useKlipperMacros) {
  const key = `${printerId}:${useKlipperMacros}`;
  // Recria o slicer só se a impressora ou o modo de G-code mudou (a definição está embutida no slicer)
  if (slicer == null || slicerKey !== key) {
    setEngineStatus('idle', 'motor por iniciar');
    slicer = new CuraWASM({
      definition: getPrinter(printerId).buildDefinition(useKlipperMacros),
      overrides: [],
      verbose: false
    });
    slicerKey = key;
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
  add('material_print_temperature', Number(printTempInput.value), 'e0');
  add('material_print_temperature_layer_0', Number(printTempInput.value) + 5, 'e0');
  add('material_bed_temperature', Number(bedTempInput.value));
  add('material_bed_temperature_layer_0', Number(bedTempInput.value) + 5);

  return overrides;
}

// O cura-wasm não resolve placeholders {setting} no G-code inicial/final
// (isso é feito pela app Python do Cura desktop, não pelo CuraEngine), por
// isso o PRINT_START do modo Klipper usa tokens sentinela que substituímos
// aqui pelas temperaturas reais (com o mesmo "bump" da camada 0 usado nos
// overrides, já que o placeholder original apontava para as versões _layer_0).
function substituteKlipperMacroTemps(gcode, printTemp, bedTemp) {
  const text = new TextDecoder().decode(gcode);
  const replaced = text
    .split(KLIPPER_MACRO_SENTINELS.bedTemp).join(String(bedTemp + 5))
    .split(KLIPPER_MACRO_SENTINELS.extruderTemp).join(String(printTemp + 5));
  return new TextEncoder().encode(replaced).buffer;
}

sliceBtn.addEventListener('click', async () => {
  if (!currentModel) return;

  const printer = getActivePrinter();
  const printTemp = Number(printTempInput.value);
  const bedTemp = Number(bedTempInput.value);
  if (printTemp > printer.limits.maxNozzleTemp || bedTemp > printer.limits.maxBedTemp) {
    setStatus(`Temperaturas acima do limite da ${printer.label} (bico ≤ ${printer.limits.maxNozzleTemp}°C, cama ≤ ${printer.limits.maxBedTemp}°C).`, true);
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
    const useKlipperMacros = printer.firmware === 'klipper' && useKlipperMacrosCheckbox.checked;
    const engine = getSlicer(printer.id, useKlipperMacros);
    engine.removeAllListeners('progress');
    engine.on('progress', (p) => {
      progressFill.style.width = `${p}%`;
      progressLabel.textContent = `${p}%`;
      setEngineStatus('busy', `a fatiar… ${p}%`);
    });

    engine['config'].overrides = buildOverrides();

    const { gcode, metadata } = await engine.slice(currentModel.slice(0), currentModelExt);
    currentGcode = useKlipperMacros ? substituteKlipperMacroTemps(gcode, printTemp, bedTemp) : gcode;

    setEngineStatus('ready', 'motor pronto');
    progressRow.hidden = true;
    resultRow.hidden = false;
    updatePrintActionVisibility();

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

// --- Impressão direta por USB ---
usbPrintBtn.addEventListener('click', async () => {
  if (!currentGcode || !serialPrinter.connected) return;

  usbPrintBtn.disabled = true;
  usbCancelPrintBtn.hidden = false;
  usbCancelPrintBtn.disabled = false;
  usbPrintProgressRow.hidden = false;
  usbPrintProgressFill.style.width = '0%';
  usbPrintProgressLabel.textContent = '0%';
  setStatus(`A imprimir ${currentGcodeName} por USB…`);

  const text = new TextDecoder().decode(currentGcode);
  try {
    await serialPrinter.printGcode(text, {
      onProgress: (done, total) => {
        const pct = Math.round((done / total) * 100);
        usbPrintProgressFill.style.width = `${pct}%`;
        usbPrintProgressLabel.textContent = `${pct}%`;
      }
    });
    setStatus(
      serialPrinter.cancelled
        ? 'Impressão cancelada — aquecedores desligados.'
        : `Impressão de ${currentGcodeName} enviada por completo.`
    );
  } catch (err) {
    console.error(err);
    setStatus(`Erro durante a impressão por USB: ${err.message}`, true);
  } finally {
    usbPrintBtn.disabled = !serialPrinter.connected;
    usbCancelPrintBtn.hidden = true;
  }
});

usbCancelPrintBtn.addEventListener('click', async () => {
  usbCancelPrintBtn.disabled = true;
  await serialPrinter.cancelPrint();
  setStatus('A cancelar impressão — aquecedores desligados. Comandos já enviados continuam a executar no firmware.', true);
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

// --- Inicialização ---
(async function init() {
  const printer = getActivePrinter();
  printerSubtitle.textContent = printer.label;
  materialHeading.textContent = `Material — ${printer.label} (máx. ${printer.limits.maxNozzleTemp}°C bico / ${printer.limits.maxBedTemp}°C cama)`;
  printTempInput.max = printer.limits.maxNozzleTemp;
  bedTempInput.max = printer.limits.maxBedTemp;
  klipperMacrosGroup.hidden = printer.firmware !== 'klipper';
  removeCustomPrinterBtn.hidden = !isCustomPrinter(printer.id);
  editCustomPrinterBtn.hidden = !isCustomPrinter(printer.id);
  updateConnectionUI(printer);
  loadProfileForActivePrinter();
  updateFileGateUI();
  setStatus(`Impressora: ${printer.label}. Confirma a impressora e a ligação (passo 2) antes de carregar um modelo.`);

  // Tenta religar a uma porta USB já autorizada nesta origem, sem novo popup
  if (printer.connection === 'usb' && isSerialSupported()) {
    try {
      const reconnected = await serialPrinter.reconnectIfAuthorized(Number(usbBaudRate.value));
      if (reconnected) {
        onUsbConnected();
        // Já está ligado a um dispositivo real — conta como confirmado.
        printerConfirmed = true;
        updateFileGateUI();
        setStatus(`Impressora: ${printer.label} (ligada por USB). Carrega um modelo STL ou 3MF para começar.`);
      }
    } catch (err) {
      console.error(err);
    }
  }
})();
