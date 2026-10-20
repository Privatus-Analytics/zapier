'use strict';

const crypto = require('crypto');
const App = require('../index');

const SECRET = 'whsec_filters';

class ZapierError extends Error {}
const z = { errors: { Error: ZapierError } };

// A signed delivery of `event` with `data`, as Zapier hands it to perform.
const deliver = async (key, event, data, inputData = {}) => {
  const content = JSON.stringify({ id: 'whd_1', event, created_at: '2026-10-20T10:15:00Z', workspace_id: 'ws_1', data });
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', SECRET).update(`${t}.${content}`).digest('hex');
  return App.triggers[key].operation.perform(z, {
    inputData,
    subscribeData: { id: 'wh_1', secret: SECRET },
    cleanedRequest: JSON.parse(content),
    rawRequest: { content, headers: { 'Http-Privatus-Signature': `t=${t},v1=${v1}` } },
  });
};

it('fires for every site when no site is chosen, and only for the chosen one otherwise', async () => {
  const data = { site_id: 'pa_1', testimonial: { id: 'tm_1', rating: 5 } };
  expect(await deliver('testimonial_received', 'testimonial.received', data)).toHaveLength(1);
  expect(await deliver('testimonial_received', 'testimonial.received', data, { site_id: 'pa_1' })).toHaveLength(1);
  expect(await deliver('testimonial_received', 'testimonial.received', data, { site_id: 'pa_2' })).toHaveLength(0);
});

it('reads the site of an uptime delivery from its check', async () => {
  const data = { check: { id: 'upc_1', site_id: 'pa_1' }, incident: { cause: 'HTTP 503' } };
  expect(await deliver('uptime_down', 'uptime.down', data, { site_id: 'pa_1' })).toHaveLength(1);
  expect(await deliver('uptime_down', 'uptime.down', data, { site_id: 'pa_2' })).toHaveLength(0);
});

it('applies the minimum rating to testimonials and form submissions', async () => {
  const low = { site_id: 'pa_1', testimonial: { id: 'tm_1', rating: 2 } };
  expect(await deliver('testimonial_approved', 'testimonial.approved', low, { min_rating: '4' })).toHaveLength(0);
  expect(await deliver('testimonial_approved', 'testimonial.approved', low, { min_rating: '2' })).toHaveLength(1);
  const unrated = { site_id: 'pa_1', form_id: 'frm_1', rating: null };
  expect(await deliver('testimonial_form_submitted', 'testimonial_form.submitted', unrated, { min_rating: '1' })).toHaveLength(0);
  expect(await deliver('testimonial_form_submitted', 'testimonial_form.submitted', unrated, { form_id: 'frm_2' })).toHaveLength(0);
  expect(await deliver('testimonial_form_submitted', 'testimonial_form.submitted', unrated, { form_id: 'frm_1' })).toHaveLength(1);
});

it('applies the alert rule filter', async () => {
  const data = { alert_id: 'alr_1', site_id: null, state: 'triggered' };
  expect(await deliver('alert_triggered', 'alert.triggered', data, { alert_id: 'alr_1' })).toHaveLength(1);
  expect(await deliver('alert_triggered', 'alert.triggered', data, { alert_id: 'alr_2' })).toHaveLength(0);
});
