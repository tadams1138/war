export type ContestantFieldType = 'string' | 'number' | 'text' | 'url' | 'date';

export interface ContestantSchemaField {
  key: string;
  label: string;
  type: ContestantFieldType;
}

export interface ValidationOk<T> {
  ok: true;
  value: T;
}

export interface ValidationErr {
  ok: false;
  errors: string[];
}

export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

const MAX_FIELDS = 12;
const KEY_FORMAT = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_LABEL_LENGTH = 64;
const VALID_TYPES: ContestantFieldType[] = ['string', 'number', 'text', 'url', 'date'];

const MAX_STRING_LENGTH = 256;
const MAX_TEXT_LENGTH = 2000;
const MAX_URL_LENGTH = 512;

function err(errors: string[]): ValidationErr {
  return { ok: false, errors };
}

function keyError(key: unknown): string | null {
  if (typeof key !== 'string' || !KEY_FORMAT.test(key)) return `invalid field key: ${String(key)}`;
  return null;
}

function labelError(key: string, label: unknown): string | null {
  if (typeof label !== 'string' || label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    return `invalid field label for key: ${key}`;
  }
  return null;
}

function typeNameError(key: string, type: unknown): string | null {
  if (typeof type !== 'string' || !VALID_TYPES.includes(type as ContestantFieldType)) {
    return `invalid field type for key: ${key}`;
  }
  return null;
}

type FieldValidation = { ok: true; field: ContestantSchemaField } | { ok: false; error: string };

/** One field's worth of `validateSchemaDefinition`'s rules, split out to keep that function's own branch count down. */
function validateSchemaField(raw: unknown, seenKeys: Set<string>): FieldValidation {
  const field = raw as Partial<ContestantSchemaField>;
  const invalidKey = keyError(field.key);
  if (invalidKey) return { ok: false, error: invalidKey };
  if (seenKeys.has(field.key as string)) {
    return { ok: false, error: `duplicate field key: ${field.key}` };
  }
  const invalidLabel = labelError(field.key as string, field.label);
  if (invalidLabel) return { ok: false, error: invalidLabel };
  const invalidType = typeNameError(field.key as string, field.type);
  if (invalidType) return { ok: false, error: invalidType };
  return { ok: true, field: { key: field.key as string, label: field.label as string, type: field.type as ContestantFieldType } };
}

function collectSchemaFields(schema: unknown[]): { errors: string[]; fields: ContestantSchemaField[] } {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  const fields: ContestantSchemaField[] = [];
  for (const raw of schema) {
    const result = validateSchemaField(raw, seenKeys);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    seenKeys.add(result.field.key);
    fields.push(result.field);
  }
  return { errors, fields };
}

/**
 * Validates a War's `contestant_schema` declaration (spec).
 */
export function validateSchemaDefinition(schema: unknown): ValidationResult<ContestantSchemaField[]> {
  if (!Array.isArray(schema)) {
    return err(['contestant_schema must be an array']);
  }
  if (schema.length > MAX_FIELDS) {
    return err([`contestant_schema may declare at most ${MAX_FIELDS} fields`]);
  }

  const { errors, fields } = collectSchemaFields(schema);
  if (errors.length > 0) {
    return err(errors);
  }
  return { ok: true, value: fields };
}

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

type FieldValidator = (field: ContestantSchemaField, value: unknown) => string | null;

function validateStringLength(maxLength: number): FieldValidator {
  return (field, value) => {
    if (typeof value !== 'string') return `${field.key} must be a string`;
    if (value.length > maxLength) return `${field.key} exceeds ${maxLength} characters`;
    return null;
  };
}

function validateNumberValue(field: ContestantSchemaField, value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${field.key} must be a number`;
  return null;
}

function validateUrlValue(field: ContestantSchemaField, value: unknown): string | null {
  if (typeof value !== 'string') return `${field.key} must be a string`;
  if (value.length > MAX_URL_LENGTH) return `${field.key} exceeds ${MAX_URL_LENGTH} characters`;
  if (!isHttpOrHttpsUrl(value)) return `${field.key} must be an http or https URL`;
  return null;
}

function validateDateValue(field: ContestantSchemaField, value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return `${field.key} must be a valid date`;
  return null;
}

/**
 * One validator per field type, keyed by `ContestantFieldType` -- a
 * `Record` requires every key present, so a type added to the union
 * without an entry here is a compile error, without one `case` per type
 * driving `validateValueForType`'s own branch count up. `string` and
 * `text` share the same rule at different length caps, rather than
 * duplicating it per `switch` case.
 */
const VALUE_VALIDATORS: Record<ContestantFieldType, FieldValidator> = {
  string: validateStringLength(MAX_STRING_LENGTH),
  text: validateStringLength(MAX_TEXT_LENGTH),
  number: validateNumberValue,
  url: validateUrlValue,
  date: validateDateValue,
};

function validateValueForType(field: ContestantSchemaField, value: unknown): string | null {
  return VALUE_VALIDATORS[field.type](field, value);
}

/**
 * Validates a contestant's `attributes` object against the War's declared
 * `contestant_schema` (spec). Every field is optional; a key outside the
 * schema, or a value of the wrong type, is rejected.
 */
export function validateAttributes(
  schema: ContestantSchemaField[],
  attributes: Record<string, unknown>,
): ValidationResult<Record<string, unknown>> {
  const byKey = new Map(schema.map((field) => [field.key, field]));
  const errors: string[] = [];

  for (const [key, value] of Object.entries(attributes)) {
    const field = byKey.get(key);
    if (!field) {
      errors.push(`unknown attribute key: ${key}`);
      continue;
    }
    const typeError = validateValueForType(field, value);
    if (typeError) {
      errors.push(typeError);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }
  return { ok: true, value: attributes };
}

export interface ResolvedAttribute {
  key: string;
  label: string;
  type: ContestantFieldType;
  value: unknown;
}

/**
 * The response body JSON Schema for {@link ResolvedAttribute} (spec).
 * Registered under `$id: "ResolvedAttribute"`
 * (`registerSharedSchemas`, `src/openapi/schemas.ts`). Kept beside the
 * interface it mirrors -- see {@link mediaItemSchema} for why.
 */
export const resolvedAttributeSchema = {
  $id: 'ResolvedAttribute',
  type: 'object',
  required: ['key', 'label', 'type', 'value'],
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    type: { type: 'string', enum: VALID_TYPES },
    value: { type: ['string', 'number'] },
  },
};

/**
 * Resolves stored attributes against the schema so responses carry labels,
 * types, and values in schema order (spec). Keys the contestant never
 * supplied are omitted.
 */
export function resolveAttributes(
  schema: ContestantSchemaField[],
  attributes: Record<string, unknown>,
): ResolvedAttribute[] {
  return schema
    .filter((field) => Object.prototype.hasOwnProperty.call(attributes, field.key))
    .map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      value: attributes[field.key],
    }));
}
