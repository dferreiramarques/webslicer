/**
 * Perfis de impressora suportados pelo WebSlicer.
 *
 * Cada perfil resolve uma definição base já incluída na cura-wasm-definitions
 * e junta-lhe overrides (dimensões, G-code inicial/final, limites) — a mesma
 * lógica de "inherits" que o Cura desktop usa internamente.
 *
 * IMPORTANTE: o CuraEngine (via cura-wasm) nunca resolve placeholders
 * `{setting}` dentro de machine_start_gcode/machine_end_gcode/
 * machine_extruder_start_code — essa substituição só existe no Cura desktop
 * (é feita pela app Python, não pelo motor C++). Por isso todo o G-code
 * definido aqui evita esses placeholders: as temperaturas ficam a cargo do
 * mecanismo de auto-inserção do próprio CuraEngine (M104/M109/M140/M190
 * antes do G-code inicial, que já lê corretamente os overrides por fatiamento),
 * exceto no caso das macros Klipper da LK4 Pro, que usam tokens sentinela
 * substituídos pelo main.js já depois de fatiar (ver KLIPPER_MACRO_SENTINELS).
 */
import { resolvePrinter, resolveExtruder } from 'cura-wasm-definitions';
import merge from 'lodash/merge';

// cura-wasm espera "machine_extruder_trains" a apontar para os índices já
// resolvidos pela própria cura-wasm (extruder-0, extruder-1, ...), não para
// os nomes originais das definições da cura-wasm-definitions.
const SINGLE_EXTRUDER_TRAIN = { 0: 'extruder-0' };

// ---------------------------------------------------------------------------
// Longer LK4 Pro
// ---------------------------------------------------------------------------

const LK4PRO_START_GCODE_MARLIN = `; LK4 Pro — start G-code (Marlin/Klipper)
G92 E0 ; reset extrusora
G28 ; home a todos os eixos
G1 Z2.0 F3000 ; sobe Z para não riscar a cama
G1 X0.1 Y20 Z0.3 F5000.0 ; posição inicial
G1 X0.1 Y200.0 Z0.3 F1500.0 E15 ; primeira linha de purga
G1 X0.4 Y200.0 Z0.3 F5000.0
G1 X0.4 Y20 Z0.3 F1500.0 E30 ; segunda linha de purga
G92 E0 ; reset extrusora
G1 Z2.0 F3000`;

export const KLIPPER_MACRO_SENTINELS = {
  bedTemp: '__WEBSLICER_BED_TEMP__',
  extruderTemp: '__WEBSLICER_EXTRUDER_TEMP__'
};

const LK4PRO_START_GCODE_KLIPPER_MACRO = `PRINT_START BED_TEMP=${KLIPPER_MACRO_SENTINELS.bedTemp} EXTRUDER_TEMP=${KLIPPER_MACRO_SENTINELS.extruderTemp}`;

const LK4PRO_END_GCODE_MARLIN = `; LK4 Pro — end G-code
G91 ; posicionamento relativo
G1 E-2 F2700
G1 E-2 Z0.2 F2400
G1 X5 Y5 F3000
G1 Z10
G90 ; posicionamento absoluto
G1 X0 Y220 ; apresenta a impressão (Y = profundidade da mesa)
M106 S0
M104 S0
M140 S0
M84 X Y E`;

const LK4PRO_END_GCODE_KLIPPER_MACRO = `PRINT_END`;

function buildLk4ProDefinition(useKlipperMacros = false) {
  // Resolve a base já incluída na biblioteca (Creality, Bowden, 220x220x250)
  const baseParent = resolvePrinter('creality_base');

  const overrides = {
    name: 'Longer LK4 Pro',
    metadata: { manufacturer: 'Longer (LGT)', visible: true },
    overrides: {
      machine_name: { default_value: 'Longer LK4 Pro' },
      machine_width: { default_value: 220 },
      machine_depth: { default_value: 220 },
      machine_height: { default_value: 250 },

      // Sem sensor de nivelamento automático — nivelamento manual nos 4 cantos
      machine_buildplate_type: { default_value: 'glass' },
      machine_max_feedrate_z: { value: 10 },
      machine_head_with_fans_polygon: {
        default_value: [
          [-26, 34],
          [-26, -32],
          [32, -32],
          [32, 34]
        ]
      },
      gantry_height: { value: 25 },

      machine_start_gcode: {
        default_value: useKlipperMacros ? LK4PRO_START_GCODE_KLIPPER_MACRO : LK4PRO_START_GCODE_MARLIN
      },
      machine_end_gcode: {
        default_value: useKlipperMacros ? LK4PRO_END_GCODE_KLIPPER_MACRO : LK4PRO_END_GCODE_MARLIN
      }
    }
  };

  const printer = merge({}, baseParent, overrides);

  // Extrusora: bico 0.4mm, filamento 1.75mm, hotend até 250°C
  const extruderParent = resolveExtruder('creality_base_extruder_0');
  const extruder = merge({}, extruderParent, {
    overrides: {
      machine_nozzle_size: { default_value: 0.4 },
      machine_nozzle_heat_up_speed: { default_value: 2.0 },
      machine_nozzle_cool_down_speed: { default_value: 1.0 }
    }
  });

  printer.metadata.machine_extruder_trains = SINGLE_EXTRUDER_TRAIN;

  return { printer, extruders: [extruder] };
}

// ---------------------------------------------------------------------------
// Prusa i3 MK3S
// ---------------------------------------------------------------------------

// G-code da Prusa Research (perfil "prusa_i3_mk3" da cura-wasm-definitions),
// com as linhas M104/M140/M190/M109 removidas — ficam a cargo da
// auto-inserção do CuraEngine. G80 é a rotina de mesh bed leveling do
// firmware Prusa (assume o firmware oficial, não Marlin vanilla).
const PRUSA_MK3S_START_GCODE = `G21 ; set units to millimeters
G90 ; use absolute positioning
M82 ; absolute extrusion mode
G28 W ; home all without mesh bed level
G80 ; mesh bed leveling
G92 E0.0 ; reset extruder distance position
G1 Y-3.0 F1000.0 ; go outside print area
G1 X60.0 E9.0 F1000.0 ; intro line
G1 X100.0 E21.5 F1000.0 ; intro line
G92 E0.0 ; reset extruder distance position`;

const PRUSA_MK3S_END_GCODE = `M104 S0 ; turn off extruder
M140 S0 ; turn off heatbed
M107 ; turn off fan
G1 X0 Y210 ; home X axis and push Y forward
M84 ; disable motors`;

function buildPrusaMk3sDefinition() {
  const baseParent = resolvePrinter('prusa_i3_mk3');

  const overrides = {
    name: 'Prusa i3 MK3S',
    metadata: { manufacturer: 'Prusa Research', visible: true },
    overrides: {
      machine_name: { default_value: 'Prusa i3 MK3S' },
      machine_start_gcode: { default_value: PRUSA_MK3S_START_GCODE },
      machine_end_gcode: { default_value: PRUSA_MK3S_END_GCODE }
    }
  };

  const printer = merge({}, baseParent, overrides);

  const extruderParent = resolveExtruder('prusa_i3_mk3_extruder_0');
  const extruder = merge({}, extruderParent, {});

  printer.metadata.machine_extruder_trains = SINGLE_EXTRUDER_TRAIN;

  return { printer, extruders: [extruder] };
}

// ---------------------------------------------------------------------------
// Creality CR-X
// ---------------------------------------------------------------------------

// A CR-X é uma impressora de dupla extrusora, mas o WebSlicer só suporta
// fatiamento com um bico por agora — usamos só a extrusora 0 (T0) e forçamos
// machine_extruder_count a 1 para o CuraEngine nunca esperar um segundo bico.
const CRX_START_GCODE = `G21 ;metric values
G28 ;home all
G90 ;absolute positioning
M107 ;start with the fan off
G1 F2400 Z15.0 ;raise the nozzle 15mm
T0 ;Switch to Extruder 1
G1 F3000 X5 Y10 Z0.2 ;move to prime start position
G92 E0 ;reset extrusion distance
G1 F600 X160 E15 ;prime nozzle in a line
G1 F5000 X180 ;quick wipe
G92 E0 ;reset extrusion distance`;

const CRX_END_GCODE = `M104 S0  ;hotend off
M140 S0  ;bed off
G92 E0
G1 F2000 E-100  ;retract filament 100mm
G92 E0
G1 F3000 X0 Y270  ;move bed for easy part removal
M84  ;disable steppers`;

function buildCrXDefinition() {
  // A cura-wasm-definitions indexa os ficheiros pelo nome do identificador
  // JS gerado a partir do nome do ficheiro (hífens viram underscore), não
  // pelo nome do ficheiro em si — por isso "creality_cr_x", não "creality_cr-x".
  const baseParent = resolvePrinter('creality_cr_x');

  const overrides = {
    name: 'Creality CR-X (bico único)',
    metadata: { manufacturer: 'Creality3D', visible: true },
    overrides: {
      machine_name: { default_value: 'Creality CR-X' },
      machine_extruder_count: { default_value: 1 },
      machine_start_gcode: { default_value: CRX_START_GCODE },
      machine_end_gcode: { default_value: CRX_END_GCODE }
    }
  };

  const printer = merge({}, baseParent, overrides);

  const extruderParent = resolveExtruder('cr_x_extruder_0');
  const extruder = merge({}, extruderParent, {
    overrides: {
      // A definição de fábrica troca de ferramenta (T0) e usa
      // {material_print_temperature} aqui — não se aplica com 1 só bico, e o
      // placeholder nunca seria substituído pelo cura-wasm de qualquer forma.
      machine_extruder_start_code: { default_value: '' },
      machine_extruder_end_code: { default_value: '' }
    }
  });

  printer.metadata.machine_extruder_trains = SINGLE_EXTRUDER_TRAIN;

  return { printer, extruders: [extruder] };
}

// ---------------------------------------------------------------------------
// Registo
// ---------------------------------------------------------------------------

export const PRINTERS = {
  lk4pro: {
    id: 'lk4pro',
    label: 'Longer LK4 Pro',
    // Klipper só fala com o Moonraker/Mainsail em rede — o seu USB não
    // aceita G-code Marlin diretamente como uma placa Marlin normal.
    firmware: 'klipper',
    connection: 'ip',
    limits: {
      bedWidth: 220,
      bedDepth: 220,
      maxHeight: 250,
      nozzleDiameter: 0.4,
      maxNozzleTemp: 250,
      maxBedTemp: 100,
      filamentDiameter: 1.75
    },
    defaults: { printTemp: 200, bedTemp: 60, printSpeed: 50, layerHeight: 0.2 },
    buildDefinition: buildLk4ProDefinition
  },
  prusa_mk3s: {
    id: 'prusa_mk3s',
    label: 'Prusa i3 MK3S',
    firmware: 'marlin',
    connection: 'usb',
    limits: {
      bedWidth: 250,
      bedDepth: 210,
      maxHeight: 210,
      nozzleDiameter: 0.4,
      maxNozzleTemp: 300,
      maxBedTemp: 120,
      filamentDiameter: 1.75
    },
    defaults: { printTemp: 215, bedTemp: 60, printSpeed: 60, layerHeight: 0.15 },
    buildDefinition: buildPrusaMk3sDefinition
  },
  cr_x: {
    id: 'cr_x',
    label: 'Creality CR-X (bico único)',
    firmware: 'marlin',
    connection: 'usb',
    limits: {
      bedWidth: 300,
      bedDepth: 300,
      maxHeight: 400,
      nozzleDiameter: 0.4,
      maxNozzleTemp: 260,
      maxBedTemp: 100,
      filamentDiameter: 1.75
    },
    defaults: { printTemp: 200, bedTemp: 60, printSpeed: 60, layerHeight: 0.2 },
    buildDefinition: buildCrXDefinition
  }
};

export const DEFAULT_PRINTER_ID = 'lk4pro';
