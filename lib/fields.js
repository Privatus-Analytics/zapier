'use strict';

const spec = require('./spec.json');

// Words the label maker would get wrong.
const WORDS = {
  id: 'ID',
  ids: 'IDs',
  url: 'URL',
  utm: 'UTM',
  dns: 'DNS',
  tcp: 'TCP',
  http: 'HTTP',
  ssl: 'SSL',
  api: 'API',
  csv: 'CSV',
  json: 'JSON',
};

/** site_id -> "Site", utm_source -> "UTM Source", person_email -> "Person Email" */
const label = (name) =>
  name
    .replace(/_id$/, '')
    .replace(/_ids$/, 's')
    .split('_')
    .map((word) => WORDS[word] || word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// Zapier allows help text of up to 1,000 characters.
const help = (text) => {
  if (!text) return undefined;
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > 990 ? `${clean.slice(0, 987).replace(/\s+\S*$/, '')}...` : clean;
};

const TYPES = { integer: 'integer', number: 'number', boolean: 'boolean' };

/** The Zapier input field for one documented input. */
const toField = (input) => {
  const field = { key: input.name, label: label(input.name) };
  const text = help(input.description);
  if (text) field.helpText = text;
  if (input.required) field.required = true;

  if (input.enum) {
    field.choices = input.enum.map(String);
  } else if (input.type === 'array') {
    if (input.items === 'object' || input.items === 'array' || input.name === 'filters') {
      field.type = 'text';
    } else {
      field.list = true;
      if (input.itemsEnum) field.choices = input.itemsEnum.map(String);
    }
  } else if (input.type === 'object') {
    field.type = 'text';
  } else if (TYPES[input.type]) {
    field.type = TYPES[input.type];
  } else {
    field.type = 'string';
  }
  if (input.default !== undefined && typeof input.default !== 'object') field.default = String(input.default);
  return field;
};

const SKIP = new Set(['page', 'per_page', 'workspace_id']);

/**
 * Zapier input fields for an operation, from its documented inputs.
 *   only:     names to keep, in this order
 *   omit:     names to leave out
 *   override: { name: { ...field properties } }, merged over the generated field
 *   extra:    fields to append (not in the API, used by perform)
 * site_id is always the Site dropdown, first.
 */
const inputFields = (operationId, { only, omit = [], override = {}, extra = [] } = {}) => {
  const operation = spec[operationId];
  if (!operation) throw new Error(`Unknown operation ${operationId}`);
  const byName = Object.fromEntries(operation.inputs.map((input) => [input.name, input]));
  const names = only || operation.inputs.map((input) => input.name);
  const fields = names
    .filter((name) => !SKIP.has(name) && !omit.includes(name))
    .map((name) => {
      const input = byName[name];
      if (!input && !override[name]) throw new Error(`${operationId} has no input ${name}`);
      const generated = input ? toField(input) : { key: name };
      const merged = { ...generated, ...(override[name] || {}) };
      // An override of `undefined` removes the generated property.
      return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
    });
  return fields.concat(extra);
};

/** The documented outputs of an operation, as Zapier output fields (prefixed for nesting). */
const outputFields = (operationId, { prefix = '', skip = [] } = {}) =>
  spec[operationId].outputs
    .filter((output) => !skip.includes(output.name))
    // Objects and lists are left to Zapier's own sample-based fields: declared
    // as text they would not match the sample (check D024).
    .filter((output) => output.type !== 'object' && output.type !== 'array')
    .map((output) => {
      const field = { key: `${prefix}${output.name}`, label: label(`${prefix.replace(/__/g, '_')}${output.name}`) };
      if (output.type === 'integer' || output.type === 'number') field.type = 'number';
      if (output.type === 'boolean') field.type = 'boolean';
      if (/_at$/.test(output.name)) field.type = 'datetime';
      return field;
    });

// Dynamic dropdowns shared by many fields (hidden triggers in triggers/lists.js).
const SITE = {
  key: 'site_id',
  label: 'Site',
  required: true,
  dynamic: 'site_list.id.name',
  altersDynamicFields: true,
  helpText: 'The site, from the sites this API token can open. To use a site ID from an earlier step, choose **Custom**.',
};

const dropdown = (key, lists, labelText, extra = {}) => ({
  key,
  label: labelText,
  dynamic: lists,
  ...extra,
});

module.exports = { label, help, toField, inputFields, outputFields, SITE, dropdown };
