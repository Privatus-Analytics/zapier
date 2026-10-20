'use strict';

const { url } = require('../lib/api');

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * "/sites/pa_X/goals" -> "/sites/pa_X/goals.json". Only a path on the API
 * host is accepted: the token is never sent anywhere else.
 */
const apiPath = (z, raw) => {
  let path = String(raw || '').trim();
  if (/^https?:\/\//i.test(path)) path = path.replace(/^https?:\/\/[^/]+/i, '');
  if (!path.startsWith('/') || path.startsWith('//') || /[\s\\]/.test(path) || path.split('/').includes('..')) {
    throw new z.errors.Error('URL Path must be a path like /sites/pa_7Q2K9XH3AB/goals.json.', 'InvalidPath', 400);
  }
  const [base, query] = path.split('?');
  const withJson = base.endsWith('.json') ? base : `${base.replace(/\/$/, '')}.json`;
  return query ? `${withJson}?${query}` : withJson;
};

const parseBody = (z, body) => {
  if (body === undefined || body === null || body === '') return undefined;
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch (e) {
    throw new z.errors.Error('Body must be valid JSON.', 'InvalidJson', 400);
  }
};

const apiRequest = {
  key: 'api_request',
  noun: 'API Request',
  display: {
    label: 'API Request (Advanced)',
    description:
      'Calls any endpoint of the Privatus Analytics API with this connection, for what the other actions do not cover. See privatusanalytics.com/docs/api.',
  },
  operation: {
    inputFields: [
      { key: 'method', label: 'HTTP Method', required: true, choices: METHODS, default: 'GET' },
      {
        key: 'path',
        label: 'URL Path',
        required: true,
        helpText: 'The path of the endpoint, like `/sites/pa_7Q2K9XH3AB/stats/aggregate.json`. `.json` is added when missing. Every endpoint is listed at privatusanalytics.com/docs/api.',
      },
      { key: 'query', label: 'Query String Parameters', dict: true, helpText: 'For example period = 30d.' },
      { key: 'body', label: 'Body', type: 'code', helpText: 'A JSON object, for POST, PATCH and PUT.' },
    ],
    perform: async (z, bundle) => {
      const method = String(bundle.inputData.method || 'GET').toUpperCase();
      if (!METHODS.includes(method)) throw new z.errors.Error(`HTTP Method must be one of ${METHODS.join(', ')}.`, 'InvalidMethod', 400);
      const response = await z.request({
        method,
        url: url(apiPath(z, bundle.inputData.path)),
        params: bundle.inputData.query || {},
        body: method === 'GET' || method === 'DELETE' ? undefined : parseBody(z, bundle.inputData.body),
      });
      let data = null;
      try {
        data = response.content ? JSON.parse(response.content) : null;
      } catch (e) {
        data = response.content;
      }
      return { status: response.status, data };
    },
    sample: { status: 200, data: { data: { id: 'goal_7Q2K9XH3AB', name: 'Signup' } } },
    outputFields: [
      { key: 'status', label: 'HTTP Status', type: 'number' },
      { key: 'data__meta__total', label: 'Total (Lists)', type: 'number' },
    ],
  },
};

// apiPath is not enumerable, so it stays out of the app definition.
Object.defineProperty(apiRequest, 'apiPath', { value: apiPath, enumerable: false });

module.exports = apiRequest;
