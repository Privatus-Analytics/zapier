'use strict';

const { call, enc, compact } = require('../lib/api');
const samples = require('../samples');
const { siteFields } = require('./fields');

const KINDS = ['page', 'event', 'engagement', 'outbound', 'download'];
const MATCH_TYPES = ['exact', 'prefix', 'glob', 'regex'];
const VALUE_MODES = ['none', 'fixed', 'revenue'];

const perform = async (z, bundle) => {
  const input = bundle.inputData;
  const invalid = (message) => new z.errors.Error(message, 'InvalidData', 400);
  if (!KINDS.includes(input.kind)) throw invalid(`Kind must be one of: ${KINDS.join(', ')}`);
  if (input.kind === 'event' && !input.event_name) throw invalid('Event goals need an event name.');
  if (['page', 'outbound', 'download'].includes(input.kind) && !input.pattern) {
    throw invalid(`${input.kind} goals need a pattern (path or URL).`);
  }
  if (input.value_mode === 'fixed' && (input.fixed_value === undefined || input.fixed_value === '')) {
    throw invalid('A fixed value is required when value mode is "fixed".');
  }
  const fixedValue = input.fixed_value === undefined || input.fixed_value === '' ? undefined : Number(input.fixed_value);
  if (fixedValue !== undefined && Number.isNaN(fixedValue)) throw invalid('Fixed value must be a number.');

  const body = compact({
    name: input.name,
    kind: input.kind,
    match_type: input.match_type,
    pattern: input.pattern,
    event_name: input.event_name,
    value_mode: input.value_mode,
    fixed_value: fixedValue,
  });
  return call(z, bundle, 'POST', `/sites/${enc(input.site_id)}/goals.json`, { body });
};

module.exports = {
  key: 'create_goal',
  noun: 'Goal',
  display: {
    label: 'Create Goal',
    description: 'Creates a conversion goal on a site (page visit, custom event, outbound link, download…).',
  },
  operation: {
    inputFields: [
      ...siteFields,
      { key: 'name', label: 'Name', required: true },
      { key: 'kind', label: 'Kind', required: true, choices: KINDS, default: 'event' },
      {
        key: 'match_type',
        label: 'Match type',
        required: false,
        choices: MATCH_TYPES,
        default: 'exact',
        helpText: 'How the pattern is matched (page, outbound and download goals).',
      },
      { key: 'pattern', label: 'Pattern', required: false, helpText: 'e.g. `/thank-you`, `/blog/*`, or a URL.' },
      { key: 'event_name', label: 'Event name', required: false, helpText: 'For event goals, e.g. `signup`.' },
      { key: 'value_mode', label: 'Value', required: false, choices: VALUE_MODES, default: 'none' },
      {
        key: 'fixed_value',
        label: 'Fixed value',
        type: 'number',
        required: false,
        helpText: 'Per conversion, in major units of the site currency (e.g. 25.00).',
      },
    ],
    perform,
    sample: samples.goal,
    outputFields: [
      { key: 'id', label: 'Goal ID' },
      { key: 'name', label: 'Name' },
      { key: 'kind', label: 'Kind' },
    ],
  },
};
