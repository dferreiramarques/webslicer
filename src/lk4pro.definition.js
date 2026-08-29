/**
 * Definição de impressora Cura para a Longer LK4 Pro.
 *
 * Baseada na família "creality_base" da cura-wasm-definitions (geometria e
 * comportamento muito próximos: Bowden, cama de vidro, sem nivelamento
 * automático, extrusora 0.4mm), com os valores reais da LK4 Pro.
 *
 * Specs confirmadas: volume 220 x 220 x 250 mm, bico 0.4mm até 250°C,
 * cama aquecida até 100°C, sem ABL (nivelamento manual nos 4 cantos),
 * placa 32-bit com drivers TMC2208.
 *
 * O firmware original é Marlin, mas com Klipper + Mainsail o dialecto de
 * G-code aceite continua compatível com o gerado pelo CuraEngine (Marlin
 * flavor). Se tiveres macros PRINT_START / PRINT_END no teu printer.cfg,
 * troca o start/end G-code nas Definições da app por chamadas às macros.
 */
import { resolvePrinter, resolveExtruder } from 'cura-wasm-definitions';
import merge from 'lodash/merge';

const START_GCODE_MARLIN = `; LK4 Pro — start G-code (Marlin/Klipper)
G92 E0 ; reset extrusora
G28 ; home a todos os eixos
G1 Z2.0 F3000 ; sobe Z para não riscar a cama
G1 X0.1 Y20 Z0.3 F5000.0 ; posição inicial
G1 X0.1 Y200.0 Z0.3 F1500.0 E15 ; primeira linha de purga
G1 X0.4 Y200.0 Z0.3 F5000.0
G1 X0.4 Y20 Z0.3 F1500.0 E30 ; segunda linha de purga
G92 E0 ; reset extrusora
G1 Z2.0 F3000`;

/**
 * O CuraEngine (via cura-wasm) não resolve placeholders `{setting}` dentro do
 * G-code inicial/final — essa substituição só existe no Cura desktop (é
 * feita pela app Python, não pelo motor). Por isso usamos aqui tokens
 * sentinela fixos, que o main.js substitui pelo valor real das temperaturas
 * já depois de fatiar (ver KLIPPER_MACRO_SENTINELS).
 */
export const KLIPPER_MACRO_SENTINELS = {
  bedTemp: '__WEBSLICER_BED_TEMP__',
  extruderTemp: '__WEBSLICER_EXTRUDER_TEMP__'
};

const START_GCODE_KLIPPER_MACRO = `PRINT_START BED_TEMP=${KLIPPER_MACRO_SENTINELS.bedTemp} EXTRUDER_TEMP=${KLIPPER_MACRO_SENTINELS.extruderTemp}`;

const END_GCODE_MARLIN = `; LK4 Pro — end G-code
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

const END_GCODE_KLIPPER_MACRO = `PRINT_END`;

/**
 * Constrói a definição combinada (printer + extruders) para a LK4 Pro,
 * seguindo a mesma lógica de resolução (merge de "inherits") usada
 * internamente pela cura-wasm-definitions.
 *
 * @param {boolean} useKlipperMacros usar PRINT_START/PRINT_END em vez de G-code cru
 */
export function buildLk4ProDefinition(useKlipperMacros = false) {
  // Resolve a base já incluída na biblioteca (Creality, Bowden, 220x220x250)
  const baseParent = resolvePrinter('creality_base');

  const lk4ProOverrides = {
    name: 'Longer LK4 Pro',
    metadata: {
      manufacturer: 'Longer (LGT)',
      visible: true
    },
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
        default_value: useKlipperMacros ? START_GCODE_KLIPPER_MACRO : START_GCODE_MARLIN
      },
      machine_end_gcode: {
        default_value: useKlipperMacros ? END_GCODE_KLIPPER_MACRO : END_GCODE_MARLIN
      }
    }
  };

  const printer = merge({}, baseParent, lk4ProOverrides);

  // Extrusora: bico 0.4mm, filamento 1.75mm, hotend até 250°C
  const extruderParent = resolveExtruder('creality_base_extruder_0');
  const extruder = merge({}, extruderParent, {
    overrides: {
      machine_nozzle_size: { default_value: 0.4 },
      machine_nozzle_heat_up_speed: { default_value: 2.0 },
      machine_nozzle_cool_down_speed: { default_value: 1.0 }
    }
  });

  // A cura-wasm espera "machine_extruder_trains" a apontar para os índices
  // já resolvidos (extruder-0, extruder-1, ...)
  printer.metadata.machine_extruder_trains = { 0: 'extruder-0' };

  return {
    printer,
    extruders: [extruder]
  };
}

/** Limites físicos da LK4 Pro usados pela UI (validação, preview, etc.) */
export const LK4_PRO_LIMITS = {
  bedWidth: 220,
  bedDepth: 220,
  maxHeight: 250,
  nozzleDiameter: 0.4,
  maxNozzleTemp: 250,
  maxBedTemp: 100,
  filamentDiameter: 1.75
};
