'use strict';

// Shared "pick a site" fields for actions.
const siteFields = [
  {
    key: 'workspace_id',
    label: 'Workspace',
    required: false,
    dynamic: 'workspace_list.id.name',
    altersDynamicFields: true,
    helpText: 'Optional: narrows the Site dropdown.',
  },
  {
    key: 'site_id',
    label: 'Site',
    required: true,
    dynamic: 'site_list.id.name',
    helpText: 'The site (id `pa_…`).',
  },
];

module.exports = { siteFields };
