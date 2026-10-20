'use strict';

const { run } = require('./api');
const { outputFields: specOutputs } = require('./fields');
const records = require('../samples/records.json');

/**
 * An action (create) that calls one API operation.
 *   operationId  the operation in lib/spec.json
 *   fields       Zapier input fields
 *   prepare      async (z, bundle) => values for the operation (default: inputData)
 *   shape        (result, bundle) => what the Zap gets (default: the result)
 *   sample       a sample of the output (default: samples/records.json[sampleKey])
 */
const makeCreate = (def) => ({
  key: def.key,
  noun: def.noun,
  display: { label: def.label, description: def.description },
  operation: {
    inputFields: def.fields,
    perform: async (z, bundle) => {
      const values = def.prepare ? await def.prepare(z, bundle) : bundle.inputData;
      const result = await run(z, bundle, def.operationId, values);
      return def.shape ? def.shape(result, bundle) : result;
    },
    sample: def.sample || records[def.sampleKey],
    outputFields: def.outputFields || specOutputs(def.operationId),
  },
});

/**
 * A search. `perform` returns the matches, best first (Zapier uses the
 * first). Pair it with a create through `searchOrCreates` in index.js.
 */
const makeSearch = (def) => ({
  key: def.key,
  noun: def.noun,
  display: { label: def.label, description: def.description },
  operation: {
    inputFields: def.fields,
    perform: def.perform,
    sample: def.sample || records[def.sampleKey],
    outputFields: def.outputFields || (def.operationId ? specOutputs(def.operationId) : undefined),
  },
});

module.exports = { makeCreate, makeSearch };
