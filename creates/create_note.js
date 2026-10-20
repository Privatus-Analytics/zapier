'use strict';

const { call, enc, compact, toDate } = require('../lib/api');
const samples = require('../samples');
const { siteFields } = require('./fields');

const COLORS = ['neutral', 'brand', 'blue', 'amber', 'red', 'violet'];

const perform = async (z, bundle) => {
  const input = bundle.inputData;
  const date = toDate(input.date) || new Date().toISOString().slice(0, 10);
  if (input.color && !COLORS.includes(input.color)) {
    throw new z.errors.Error(`Color must be one of: ${COLORS.join(', ')}`, 'InvalidData', 400);
  }
  const body = compact({
    date,
    end_date: toDate(input.end_date),
    title: input.title,
    body: input.body,
    url: input.url,
    color: input.color,
  });
  return call(z, bundle, 'POST', `/sites/${enc(input.site_id)}/notes.json`, { body });
};

module.exports = {
  key: 'create_note',
  noun: 'Note',
  display: {
    label: 'Create Note',
    description: 'Adds an annotation (release, campaign, incident…) to a site\'s charts.',
  },
  operation: {
    inputFields: [
      ...siteFields,
      { key: 'date', label: 'Date', type: 'datetime', required: false, helpText: 'Defaults to today. Only the day is used.' },
      { key: 'end_date', label: 'End date', type: 'datetime', required: false, helpText: 'For multi-day notes.' },
      { key: 'title', label: 'Title', type: 'string', required: true },
      { key: 'body', label: 'Body', type: 'text', required: false },
      { key: 'url', label: 'Link URL', type: 'string', required: false },
      { key: 'color', label: 'Color', type: 'string', required: false, choices: COLORS, default: 'neutral' },
    ],
    perform,
    sample: samples.note,
    outputFields: [
      { key: 'id', label: 'Note ID' },
      { key: 'site_id', label: 'Site ID' },
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Title' },
      { key: 'color', label: 'Color' },
    ],
  },
};
