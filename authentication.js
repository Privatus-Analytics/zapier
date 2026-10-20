'use strict';

const { url } = require('./lib/api');

// Checks the token with GET /workspaces.json, which lists only the token's
// own workspace, and keeps its name for the connection label.
const test = async (z) => {
  const response = await z.request({ url: url('/workspaces.json') });
  const workspace = ((response.data && response.data.data) || [])[0];
  if (!workspace) {
    throw new z.errors.Error('This API token cannot see any workspace.', 'NoWorkspace', 403);
  }
  return { workspace_id: workspace.id, workspace_name: workspace.name, plan: workspace.plan, role: workspace.role };
};

module.exports = {
  type: 'custom',
  fields: [
    {
      computed: false,
      key: 'api_token',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText:
        'In Privatus Analytics, open **Workspace settings → API tokens** and create a token. It starts with `pat_` and works in one workspace. ' +
        'For every trigger and action to work, keep all permissions, **Every site you can access** and an expiry of **never**. ' +
        'Triggers add a webhook, which needs the workspace settings permission and every site. ' +
        '[Learn more](https://privatusanalytics.com/docs/api/authentication)',
    },
  ],
  test,
  connectionLabel: '{{bundle.inputData.workspace_name}}',
};
