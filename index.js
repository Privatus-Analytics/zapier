'use strict';

const authentication = require('./authentication');
const { triggers: hookTriggers } = require('./triggers/events');
const { LISTS } = require('./triggers/lists');
const pollingTriggers = require('./triggers/polling');
const analyticsCreates = require('./creates/analytics');
const testimonialCreates = require('./creates/testimonials');
const apiRequest = require('./creates/api_request');
const searches = require('./searches');

const byKey = (list) => Object.fromEntries(list.map((item) => [item.key, item]));

// Every request: the token, JSON both ways.
const addAuth = (request, z, bundle) => {
  const token = bundle.authData && bundle.authData.api_token;
  if (token) request.headers.Authorization = `Bearer ${String(token).trim()}`;
  request.headers.Accept = 'application/json';
  if (request.body && typeof request.body === 'object') request.headers['Content-Type'] = 'application/json';
  return request;
};

// The API's error envelope ({ error: { code, message, details } }) as a
// Zapier error people can act on.
const handleErrors = (response, z) => {
  if (response.status < 400) return response;
  if (response.skipThrowForStatus || (response.request && response.request.skipThrowForStatus)) return response;
  let message = `Privatus Analytics responded with HTTP ${response.status}`;
  let code = 'ApiError';
  try {
    const body = response.data && typeof response.data === 'object' ? response.data : JSON.parse(response.content);
    if (body && body.error) {
      message = body.error.message || message;
      code = body.error.code || code;
      const details = body.error.details;
      if (details && typeof details === 'object' && !Array.isArray(details)) {
        const lines = Object.entries(details).map(([field, problems]) => `${field}: ${[].concat(problems).join(', ')}`);
        if (lines.length) message = `${message} (${lines.join('; ')})`;
      }
    }
  } catch (e) {
    /* not JSON */
  }
  if (response.status === 401) {
    throw new z.errors.ExpiredAuthError(`The Privatus Analytics API token was refused: ${message}`);
  }
  if (response.status === 402) {
    throw new z.errors.Error(`${message} This needs a higher Privatus Analytics plan.`, code, 402);
  }
  if (response.status === 429) {
    throw new z.errors.ThrottledError(message, 60);
  }
  throw new z.errors.Error(message, code, response.status);
};

const creates = [...analyticsCreates, ...testimonialCreates, apiRequest];

// The steps listed in Zapier's directory. Zapier's review wants every
// listed step running in a turned-on Zap, so the first public version
// lists these 14 and keeps the rest hidden (still built and tested, and
// usable in Zaps that already have them). Unhide more in a later version.
const LISTED = new Set([
  // Triggers
  'testimonial_received', 'testimonial_approved', 'site_created', 'export_ready', 'new_goal',
  // Actions
  'create_note', 'create_goal', 'create_site', 'create_testimonial', 'moderate_testimonial',
  'update_testimonial', 'create_uptime_check', 'create_export', 'create_campaign_link',
]);

const listedOnly = (items) =>
  items.map((item) => (LISTED.has(item.key) || item.display.hidden ? item : { ...item, display: { ...item.display, hidden: true } }));

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  authentication,
  // Inputs are typed and blank values dropped by lib/api.js#coerce, so
  // Zapier's own cleaning is not needed (check D028).
  flags: { cleanInputData: false },
  beforeRequest: [addAuth],
  afterResponse: [handleErrors],

  triggers: byKey(listedOnly([...hookTriggers, ...pollingTriggers, ...LISTS])),
  creates: byKey(listedOnly(creates)),
  searches: byKey(listedOnly(searches)),

  searchOrCreates: {
  },
};
