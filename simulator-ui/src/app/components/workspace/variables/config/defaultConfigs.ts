import type { StringFormattedMaskType, StringVariableConfig, VariableConfig, VariableType } from '../../../../types';
import { defaultBoundsFor } from '../../../../core/pointDefaults';

/** Default Temporal format: ISO-8601 with milliseconds and offset (the first TIMESTAMP preset). */
export const DEFAULT_TEMPORAL_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSSZ";

/**
 * Config of a new variable (or list item generator) of the given type. Every value the editor
 * shows for a new variable is written explicitly, so the Core generates exactly what the editor
 * shows even if its own defaults change.
 */
export function defaultConfigForType(type: VariableType): VariableConfig {
  switch (type) {
    case 'numeric':
      return { pattern: 'RANDOM', min: 0, max: 100, precision: 'DOUBLE', distribution: 'UNIFORM' };
    case 'list':
      return { selectionStrategy: 'WEIGHTED_RANDOM', items: [] };
    case 'boolean':
      return { pattern: 'CONSTANT_BOOLEAN', currentValue: false };
    case 'temporal':
      return { temporalType: 'TIMESTAMP', timeAdvanceMode: 'WALL_CLOCK', dateFormat: DEFAULT_TEMPORAL_FORMAT };
    case 'point':
      return {
        pattern: 'RANDOM_POINT',
        coordinateSystem: 'CARTESIAN_3D',
        maxStepDistance: 10,
        ...defaultBoundsFor('CARTESIAN_3D'),
      };
    case 'string':
    default:
      return { pattern: 'RANDOM_STRING', fixedLength: 8 };
  }
}

/** {@link defaultConfigForType} as the pretty JSON text kept by the create dialog and editor drafts. */
export function defaultConfigTextForType(type: VariableType): string {
  return JSON.stringify(defaultConfigForType(type), null, 2);
}

/** Mask written for the mask types that generate from a pattern: the Core returns "" for an empty one. */
export const DEFAULT_STRING_MASKS: Partial<Record<StringFormattedMaskType, string>> = {
  ALPHANUMERIC: '????????',
  CUSTOM_MASK: 'SENSOR-####-$$$$',
};

/**
 * Settings a String generation mode needs to generate non-empty text, for the ones the config
 * lacks (values already set are kept). Written when switching mode or mask type, because the Core
 * generates "" for an empty regex, constant or mask and rejects an empty template.
 *
 * @param pattern the String generation mode being selected
 * @param config the current config
 * @returns the fields to add to the config (empty when it already has them)
 */
export function stringModeDefaults(pattern: string, config: StringVariableConfig): Partial<StringVariableConfig> {
  switch (pattern) {
    case 'REGEX':
      return config.regexPattern?.trim() ? {} : { regexPattern: '[A-Z]{3}-[0-9]{4}' };
    case 'CONSTANT':
      return config.constantValue ? {} : { constantValue: 'active' };
    case 'TEMPLATE':
      return config.template ? {} : { template: 'DEV-001' };
    case 'FORMATTED_MASK': {
      const formattedMaskType = config.formattedMaskType ?? 'ALPHANUMERIC';
      const mask = DEFAULT_STRING_MASKS[formattedMaskType];
      return {
        ...(config.formattedMaskType ? {} : { formattedMaskType }),
        ...(mask && !config.customMask ? { customMask: mask } : {}),
      };
    }
    case 'RANDOM_STRING':
    default:
      return (config.fixedLength ?? 0) > 0 ? {} : { fixedLength: 8 };
  }
}
