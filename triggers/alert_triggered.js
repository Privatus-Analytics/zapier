'use strict';

const { call, enc } = require('../lib/api');
const samples = require('../samples');
const { makeHookTrigger } = require('./hook');

module.exports = makeHookTrigger({
  key: 'alert_triggered',
  noun: 'Alert',
  label: 'Alert Triggered',
  description: 'Triggers when a traffic alert fires (threshold crossed, spike/drop anomaly, uptime of tracking…).',
  event: 'alert.triggered',
  sample: samples.alertTriggered,
  extraFields: [
    {
      key: 'site_id',
      label: 'Site',
      required: false,
      dynamic: 'site_list.id.name',
      helpText: 'Only trigger for this site. Leave empty for every site in the workspace.',
    },
  ],
  matches: (item, input) => !input.site_id || item.site_id === input.site_id,
  performListSample: async (z, bundle) => {
    const { site_id: siteId } = bundle.inputData || {};
    if (!siteId) return samples.alertTriggered;
    try {
      const site = await call(z, bundle, 'GET', `/sites/${enc(siteId)}.json`);
      return {
        ...samples.alertTriggered,
        workspace_id: site.workspace_id,
        site_id: site.id,
        site_domain: site.domain,
        site_name: site.name,
      };
    } catch (e) {
      return samples.alertTriggered;
    }
  },
});
