'use strict';

// A08-104: a hook delivery fires a Zap only when it carries the signature the
// webhooks API really sends (docs: /docs/api/webhooks):
//
//   Privatus-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
//
// keyed with the endpoint's signing secret, returned when the Zap subscribed.

const assert = require('node:assert');
const crypto = require('crypto');
const { verifySignature } = require('../lib/api');
const App = require('../index');
const ruby = require('./fixtures-ruby-signature.json');

const trigger = App.triggers.testimonial_received.operation;

const SECRET = 'whsec_0123456789abcdef0123456789abcdef0123456789abcdef';
const NOW = 1790000000;
const body = JSON.stringify({
  id: 'whd_1',
  event: 'testimonial.received',
  created_at: '2026-10-20T10:15:00Z',
  workspace_id: 'ws_1',
  data: { site_id: 'pa_1', testimonial: { id: 'tm_1', rating: 5 }, source: 'form', held_for_allowance: false },
});

const sign = (content, time = NOW, secret = SECRET) =>
  `t=${time},v1=${crypto.createHmac('sha256', secret).update(`${time}.${content}`).digest('hex')}`;

// A delivery as Zapier hands it to perform: custom headers get an Http- prefix.
const delivery = (header, { name = 'Http-Privatus-Signature', content = body, secret = SECRET, inputData = {} } = {}) => ({
  inputData,
  subscribeData: { id: 'wh_1', secret, workspace_id: 'ws_1' },
  cleanedRequest: JSON.parse(content),
  rawRequest: { content, headers: header === undefined ? {} : { [name]: header } },
});

const check = (bundle, now = NOW) => verifySignature(bundle, now * 1000);

describe('webhook signature', () => {
  it('accepts a signature made by the Rails app itself (Webhook.signature_header)', () => {
    const t = Number(/t=(\d+)/.exec(ruby.header)[1]);
    const bundle = delivery(ruby.header, { content: ruby.body, secret: ruby.secret });
    assert.strictEqual(check(bundle, t), true);
  });

  it('accepts a delivery signed the way the webhooks API signs', () => {
    assert.strictEqual(check(delivery(sign(body))), true);
  });

  it('finds the header whatever its case or prefix', () => {
    ['Privatus-Signature', 'privatus-signature', 'HTTP_PRIVATUS_SIGNATURE'].forEach((name) => {
      assert.strictEqual(check(delivery(sign(body), { name })), true, name);
    });
  });

  it('refuses a delivery with no signature', () => {
    assert.strictEqual(check(delivery(undefined)), false);
  });

  it('refuses the header the API never sends', () => {
    const legacy = `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`;
    assert.strictEqual(check(delivery(legacy, { name: 'Http-X-Privatus-Signature' })), false);
  });

  it('refuses a signature made with another secret', () => {
    assert.strictEqual(check(delivery(sign(body, NOW, 'whsec_other'))), false);
  });

  it('refuses a body that was changed after signing', () => {
    const forged = body.replace('tm_1', 'tm_2');
    assert.strictEqual(check(delivery(sign(body), { content: forged })), false);
  });

  it('refuses a replay older than five minutes, and a time in the future', () => {
    assert.strictEqual(check(delivery(sign(body, NOW - 301))), false);
    assert.strictEqual(check(delivery(sign(body, NOW + 301))), false);
    assert.strictEqual(check(delivery(sign(body, NOW - 299))), true);
  });

  it('refuses malformed headers without throwing', () => {
    ['', 'garbage', 't=,v1=', `t=${NOW}`, `t=${NOW},v1=abc`, `t=abc,v1=${'a'.repeat(64)}`, `v1=${'a'.repeat(64)}`].forEach(
      (header) => assert.strictEqual(check(delivery(header)), false, header)
    );
  });

  it('refuses when no secret or no raw body is known, since nothing can be checked', () => {
    assert.strictEqual(check(delivery(sign(body), { secret: null })), false);
    assert.strictEqual(check({ subscribeData: { secret: SECRET }, rawRequest: { headers: {} } }), false);
    assert.strictEqual(check({}), false);
  });
});

describe('hook trigger', () => {
  class ZapierError extends Error {
    constructor(message, code, status) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  const z = { errors: { Error: ZapierError } };
  const fresh = (content = body) => sign(content, Math.floor(Date.now() / 1000));

  it('fires for a signed delivery, with the delivery id as the item id', async () => {
    const items = await trigger.perform(z, delivery(fresh()));
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].id, 'whd_1');
    assert.strictEqual(items[0].testimonial.id, 'tm_1');
    assert.strictEqual(items[0].occurred_at, '2026-10-20T10:15:00Z');
  });

  it('responds 401 and fires nothing for an unsigned or forged delivery', async () => {
    const forged = [delivery(undefined), delivery(sign(body, Math.floor(Date.now() / 1000), 'guess'))];
    for (const bundle of forged) {
      await assert.rejects(
        () => trigger.perform(z, bundle),
        (error) => error.code === 'InvalidSignature' && error.status === 401
      );
    }
  });

  it('fires nothing for a signed delivery of another event', async () => {
    const other = body.replace('testimonial.received', 'testimonial.approved');
    assert.deepStrictEqual(await trigger.perform(z, delivery(fresh(other), { content: other })), []);
  });
});
