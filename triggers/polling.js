'use strict';

const { run } = require('../lib/api');
const { outputFields, SITE } = require('../lib/fields');
const records = require('../samples/records.json');

// Polling triggers for records the webhooks do not announce. Zapier keeps
// the ids it has seen, so returning the newest page is enough.

const newestFirst = (list) => [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

const newGoal = {
  key: 'new_goal',
  noun: 'Goal',
  display: { label: 'New Goal', description: 'Triggers when a goal is added to a site.' },
  operation: {
    inputFields: [SITE],
    perform: async (z, bundle) =>
      newestFirst((await run(z, bundle, 'goals_list', { site_id: bundle.inputData.site_id, status: 'all', period: '7d', per_page: 100 })) || []),
    sample: records.goal,
    outputFields: outputFields('goals_list'),
  },
};

const newNote = {
  key: 'new_note',
  noun: 'Note',
  display: { label: 'New Chart Note', description: "Triggers when a note is added to a site's charts, by a person, a deploy or an incident." },
  operation: {
    inputFields: [
      SITE,
      {
        key: 'source',
        label: 'Source',
        choices: { manual: 'Added by a person', deploy: 'Deploy', system: 'System', import: 'Import', incident: 'Incident' },
        helpText: 'Only notes from this source. Leave empty for all.',
      },
    ],
    perform: async (z, bundle) =>
      newestFirst((await run(z, bundle, 'notes_list', { site_id: bundle.inputData.site_id, source: bundle.inputData.source, per_page: 100 })) || []),
    sample: records.note,
    outputFields: outputFields('notes_list'),
  },
};

module.exports = [newGoal, newNote];
