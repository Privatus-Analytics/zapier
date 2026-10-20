'use strict';

const { call, enc, listAll, normalizeDomain } = require('../lib/api');
const samples = require('../samples');

const perform = async (z, bundle) => {
  const domain = normalizeDomain(bundle.inputData.domain);
  if (!domain) throw new z.errors.Error('Enter a domain, e.g. example.com', 'InvalidData', 400);

  const workspaceIds = bundle.inputData.workspace_id
    ? [bundle.inputData.workspace_id]
    : ((await call(z, bundle, 'GET', '/workspaces.json')) || []).map((w) => w.id);

  const found = [];
  for (const id of workspaceIds) {
    const sites = await listAll(z, bundle, `/workspaces/${enc(id)}/sites.json`, { query: domain }, 3);
    sites.forEach((site) => {
      const domains = [site.domain, ...(site.extra_domains || [])].map(normalizeDomain);
      if (domains.includes(domain)) found.push(site);
    });
  }
  // Primary-domain matches first.
  found.sort((a, b) => (normalizeDomain(a.domain) === domain ? 0 : 1) - (normalizeDomain(b.domain) === domain ? 0 : 1));
  return found;
};

module.exports = {
  key: 'find_site',
  noun: 'Site',
  display: {
    label: 'Find Site',
    description: 'Finds a site by its domain (primary or extra domain).',
  },
  operation: {
    inputFields: [
      { key: 'domain', label: 'Domain', required: true, helpText: 'e.g. `example.com` (a URL works too).' },
      {
        key: 'workspace_id',
        label: 'Workspace',
        required: false,
        dynamic: 'workspace_list.id.name',
        helpText: 'Optional: search only this workspace.',
      },
    ],
    perform,
    sample: samples.site,
    outputFields: [
      { key: 'id', label: 'Site ID' },
      { key: 'workspace_id', label: 'Workspace ID' },
      { key: 'domain', label: 'Domain' },
      { key: 'name', label: 'Name' },
      { key: 'timezone', label: 'Timezone' },
      { key: 'currency', label: 'Currency' },
    ],
  },
};
