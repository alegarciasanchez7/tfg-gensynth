/**
 * Helpers for the configuration fields declared by connector plugins.
 * Validation mirrors ConnectorConfig.resolve in gensynth-plugin-api, so the UI reports the
 * same errors the Core would raise when the group starts.
 */

import type { ConnectorFieldDescriptor } from './types';

export type ConnectorConfigValues = Record<string, unknown>;

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** Default value of every field that has one. */
export function defaultConnectorConfig(fields: ConnectorFieldDescriptor[]): ConnectorConfigValues {
  const config: ConnectorConfigValues = {};
  for (const field of fields) {
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      config[field.key] = field.defaultValue;
    }
  }
  return config;
}

/**
 * The saved configuration completed with the defaults of the fields it does not set.
 * Keys that are not fields of the connector are kept, so switching versions loses nothing.
 */
export function mergeWithDefaults(
  fields: ConnectorFieldDescriptor[],
  saved: ConnectorConfigValues | undefined,
): ConnectorConfigValues {
  const merged: ConnectorConfigValues = { ...defaultConnectorConfig(fields) };
  for (const [key, value] of Object.entries(saved ?? {})) {
    if (!isEmpty(value)) merged[key] = value;
  }
  return merged;
}

/** Error of one field, or null when its value is valid. */
export function validateConnectorField(field: ConnectorFieldDescriptor, rawValue: unknown): string | null {
  const value = isEmpty(rawValue) ? field.defaultValue : rawValue;
  if (isEmpty(value)) {
    return field.required ? `${field.label} is required` : null;
  }

  switch (field.type) {
    case 'INTEGER':
    case 'DECIMAL': {
      const number = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(number)) return `${field.label} must be ${field.type === 'INTEGER' ? 'a whole number' : 'a number'}`;
      if (field.type === 'INTEGER' && !Number.isInteger(number)) return `${field.label} must be a whole number`;
      if (field.min !== undefined && number < field.min) return `${field.label} must be at least ${field.min}`;
      if (field.max !== undefined && number > field.max) return `${field.label} must be at most ${field.max}`;
      return null;
    }
    case 'BOOLEAN':
      return typeof value === 'boolean' || value === 'true' || value === 'false' ? null : `${field.label} must be true or false`;
    case 'SELECT':
      return field.options.some((option) => option.value === String(value))
        ? null
        : `${field.label} must be one of: ${field.options.map((option) => option.value).join(', ')}`;
    default:
      return null;
  }
}

/** Errors by field key; empty when the configuration is valid. */
export function validateConnectorConfig(
  fields: ConnectorFieldDescriptor[],
  config: ConnectorConfigValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const error = validateConnectorField(field, config[field.key]);
    if (error) errors[field.key] = error;
  }
  return errors;
}
