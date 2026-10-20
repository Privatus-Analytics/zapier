'use strict';

const { call, enc, url, verifySignature, workspaceId } = require('../lib/api');
const { SITE } = require('../lib/fields');

/**
 * A REST hook trigger on the workspace webhooks API
 * (https://privatusanalytics.com/docs/api/webhooks). Turning a Zap on adds a
 * webhook endpoint for one event, turning it off deletes it. Every delivery
 * is checked against the endpoint's signing secret before it fires.
 *
 * The delivery envelope is { id, event, created_at, workspace_id, data }.
 * What a Zap gets is `data` itself, plus:
 *   id          the delivery id (whd_...), unique per delivery
 *   event       the event name
 *   occurred_at the envelope's created_at
 *   workspace_id
 * An `id` inside data (exports) moves to `<idKey>` so it is not lost.
 */
const toItem = (envelope, idKey) => {
  const data = envelope && envelope.data && typeof envelope.data === 'object' ? { ...envelope.data } : {};
  if (data.id !== undefined) {
    data[idKey || 'record_id'] = data.id;
    delete data.id;
  }
  return {
    id: envelope.id,
    event: envelope.event,
    occurred_at: envelope.created_at,
    workspace_id: envelope.workspace_id,
    ...data,
  };
};

/** The site a payload belongs to (uptime payloads keep it on the check). */
const siteOf = (data) => data.site_id || (data.check && data.check.site_id) || null;

const SITE_FILTER = {
  ...SITE,
  required: false,
  altersDynamicFields: false,
  helpText: 'Only fire for this site. Leave empty to fire for every site in the workspace.',
};

/**
 * def:
 *   key, noun, label, description, event
 *   sample      the `data` of a delivery (samples/webhooks.json)
 *   siteFilter  true when the payload carries a site (adds the optional Site field)
 *   fields      extra input fields, read by `matches`
 *   matches     (item, inputData) => boolean, extra filtering
 *   list        async (z, bundle) => [data, ...] recent real records for the sample step
 *   idKey       where an `id` inside data goes
 */
const makeHookTrigger = (def) => {
  const performSubscribe = async (z, bundle) => {
    const workspace = await workspaceId(z, bundle);
    const hook = await call(z, 'POST', `/workspaces/${enc(workspace)}/webhooks.json`, {
      body: { url: bundle.targetUrl, events: [def.event], enabled: true },
    });
    // The secret signs every delivery: perform checks it.
    return { id: hook.id, secret: hook.secret, workspace_id: workspace };
  };

  const performUnsubscribe = async (z, bundle) => {
    const { id, workspace_id: workspace } = bundle.subscribeData || {};
    if (!id) return {};
    const response = await z.request({
      method: 'DELETE',
      url: url(`/workspaces/${enc(workspace || (await workspaceId(z, bundle)))}/webhooks/${enc(id)}.json`),
      skipThrowForStatus: true,
    });
    // Already deleted in Privatus Analytics is fine.
    if (response.status >= 400 && response.status !== 404) response.throwForStatus();
    return { id };
  };

  const keep = (item, inputData) => {
    if (item.event && item.event !== def.event) return false;
    if (def.siteFilter && inputData.site_id && siteOf(item) !== inputData.site_id) return false;
    return !def.matches || def.matches(item, inputData);
  };

  const perform = async (z, bundle) => {
    if (!verifySignature(bundle)) {
      throw new z.errors.Error('Webhook signature missing or invalid. Delivery ignored.', 'InvalidSignature', 401);
    }
    const item = toItem(bundle.cleanedRequest, def.idKey);
    return keep(item, bundle.inputData || {}) ? [item] : [];
  };

  // The sample step: recent real records shaped like a delivery, or the
  // documented sample when there are none.
  const performList = async (z, bundle) => {
    const inputData = bundle.inputData || {};
    let records = [];
    if (def.list) records = (await def.list(z, bundle)) || [];
    const items = records
      .map((data, i) => toItem({ id: `sample_${def.key}_${i + 1}`, event: def.event, created_at: data.__at || new Date().toISOString(), workspace_id: data.__workspace, data: strip(data) }, def.idKey))
      .filter((item) => keep(item, inputData));
    return items.length ? items.slice(0, 10) : [sampleItem(def)];
  };

  const sample = sampleItem(def);
  return {
    key: def.key,
    noun: def.noun,
    display: { label: def.label, description: def.description },
    operation: {
      type: 'hook',
      inputFields: [...(def.siteFilter ? [SITE_FILTER] : []), ...(def.fields || [])],
      performSubscribe,
      performUnsubscribe,
      perform,
      performList,
      sample,
      outputFields: def.outputFields || [
        { key: 'id', label: 'Delivery ID' },
        { key: 'event', label: 'Event' },
        { key: 'occurred_at', label: 'Occurred At', type: 'datetime' },
      ],
    },
  };
};

const strip = (data) => Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('__')));

const sampleItem = (def) =>
  toItem(
    { id: 'whd_9K3M7QX2PL', event: def.event, created_at: '2026-10-20T10:15:00Z', workspace_id: 'ws_5N8D2WLE4C', data: def.sample },
    def.idKey
  );

module.exports = { makeHookTrigger, toItem, siteOf };
