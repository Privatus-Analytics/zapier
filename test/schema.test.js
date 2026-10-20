'use strict';

// Offline validation of the app definition against the Zapier schema
// (the same check `zapier validate` runs locally), plus the rules Zapier's
// publishing checks apply that the schema does not.
const { validateAppDefinition } = require('zapier-platform-schema');
const App = require('../index');
const { DEFINITIONS } = require('../triggers/events');
const spec = require('../lib/spec.json');
const operations = require('../lib/operations');

const visible = (group) => Object.values(App[group]).filter((item) => !item.display.hidden);

it('app definition is valid', () => {
  // Functions are serialised the way zapier-platform-core does ($func$<arity>$f$).
  const serialised = JSON.parse(JSON.stringify(App, (k, v) => (typeof v === 'function' ? `$func$${v.length}$f$` : v)));
  const result = validateAppDefinition(serialised);
  expect(result.errors.map((e) => `${e.property}: ${e.message}`)).toEqual([]);
});

it('has a hook trigger for every webhook event the API sends', () => {
  const events = spec.webhooks_create.inputs.find((input) => input.name === 'events').itemsEnum;
  expect(DEFINITIONS.map((def) => def.event).sort()).toEqual([...events].sort());
  DEFINITIONS.forEach((def) => expect(App.triggers[def.key].operation.type).toBe('hook'));
});

it('gives every visible trigger, action and search a sample with an id-like key and output fields', () => {
  ['triggers', 'creates', 'searches'].forEach((group) => {
    visible(group).forEach((item) => {
      const { sample } = item.operation;
      expect([item.key, typeof sample]).toEqual([item.key, 'object']);
      expect([item.key, Object.keys(sample).length > 0]).toEqual([item.key, true]);
      expect([item.key, Array.isArray(item.operation.outputFields)]).toEqual([item.key, true]);
    });
  });
  visible('triggers').forEach((item) => expect([item.key, Boolean(item.operation.sample.id)]).toEqual([item.key, true]));
});

it('keeps dropdown triggers hidden', () => {
  ['site_list', 'goal_list', 'alert_list', 'uptime_check_list', 'testimonial_form_list', 'testimonial_request_list'].forEach((key) =>
    expect(App.triggers[key].display.hidden).toBe(true)
  );
});

it('writes descriptions Zapier accepts: a sentence of 20 to 1,000 characters', () => {
  ['triggers', 'creates', 'searches'].forEach((group) => {
    visible(group).forEach((item) => {
      const text = item.display.description;
      expect([item.key, text.length >= 20 && text.length <= 1000, /\.$/.test(text)]).toEqual([item.key, true, true]);
    });
  });
});

it('keeps help text within 1,000 characters', () => {
  const fields = [];
  ['triggers', 'creates', 'searches'].forEach((group) =>
    Object.values(App[group]).forEach((item) => (item.operation.inputFields || []).forEach((field) => fields.push([item.key, field])))
  );
  fields.forEach(([key, field]) => expect([key, field.key, (field.helpText || '').length <= 1000]).toEqual([key, field.key, true]));
});

it('never uses the brand name alone, and never "answer" for a server', () => {
  const text = JSON.stringify(App, (k, v) => (typeof v === 'function' ? undefined : v));
  const labels = text.match(/"(label|description|helpText)":"[^"]*"/g) || [];
  labels.forEach((entry) => {
    expect([entry, /Privatus(?! Analytics)/.test(entry)]).toEqual([entry, false]);
    expect([entry, /\banswer/i.test(entry)]).toEqual([entry, false]);
  });
});

it('has every operation it calls in the synced spec', () => {
  expect(Object.keys(spec).sort()).toEqual([...operations].sort());
});
