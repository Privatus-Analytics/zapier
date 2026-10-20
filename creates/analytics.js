'use strict';

const { compact, normalizeDomain, run, toDate, toMonth } = require('../lib/api');
const { inputFields, SITE, dropdown } = require('../lib/fields');
const { makeCreate } = require('../lib/actions');

const TODAY_HELP = 'Defaults to today.';

const createSite = makeCreate({
  key: 'create_site',
  noun: 'Site',
  label: 'Create Site',
  description: 'Adds a website to the workspace and returns its tracking snippet.',
  operationId: 'sites_create',
  sampleKey: 'site',
  fields: inputFields('sites_create', {
    override: {
      domain: { helpText: 'The domain to track, like example.com. A pasted address such as `https://www.example.com/pricing` is shortened to example.com.' },
    },
  }),
  prepare: async (z, bundle) => ({ ...bundle.inputData, domain: normalizeDomain(bundle.inputData.domain) }),
});

const createGoal = makeCreate({
  key: 'create_goal',
  noun: 'Goal',
  label: 'Create Goal',
  description: 'Creates a conversion goal on a site. Goals count matching events across all existing history at once.',
  operationId: 'goals_create',
  sampleKey: 'goal',
  fields: [
    SITE,
    ...inputFields('goals_create', {
      omit: ['site_id'],
      override: {
        conditions: {
          helpText: 'Event goals only. A JSON list of property tests that must all match, like `[{"key":"plan","operator":"is","value":"pro"}]`. Operators: is, is_not, contains, gt, lt.',
        },
        fixed_value: { helpText: 'The value of one completion in the site currency, like 49.5. Used when Value Mode is fixed.' },
      },
    }),
  ],
});

const createNote = makeCreate({
  key: 'create_note',
  noun: 'Note',
  label: 'Create Chart Note',
  description: "Adds a note (annotation) to a site's charts, such as a deploy, a campaign launch or an outage.",
  operationId: 'notes_create',
  sampleKey: 'note',
  fields: [
    SITE,
    ...inputFields('notes_create', {
      omit: ['site_id'],
      override: {
        date: { type: 'datetime', helpText: `The day the note is shown on. ${TODAY_HELP}` },
        end_date: { type: 'datetime', helpText: 'For a note that covers several days, the last day.' },
      },
    }),
  ],
  prepare: async (z, bundle) => ({
    ...bundle.inputData,
    date: toDate(bundle.inputData.date) || new Date().toISOString().slice(0, 10),
    end_date: toDate(bundle.inputData.end_date),
  }),
});

const createWorkspaceNote = makeCreate({
  key: 'create_workspace_note',
  noun: 'Note',
  label: 'Create Workspace Chart Note',
  description: "Adds a note to the charts of every site in the workspace, such as a release that touched them all.",
  operationId: 'workspace_notes_create',
  sampleKey: 'workspace_note',
  fields: inputFields('workspace_notes_create', {
    override: {
      date: { type: 'datetime', helpText: `The day the note is shown on. ${TODAY_HELP}` },
      end_date: { type: 'datetime', helpText: 'For a note that covers several days, the last day.' },
    },
  }),
  prepare: async (z, bundle) => ({
    ...bundle.inputData,
    date: toDate(bundle.inputData.date) || new Date().toISOString().slice(0, 10),
    end_date: toDate(bundle.inputData.end_date),
  }),
});

const createCampaignLink = makeCreate({
  key: 'create_campaign_link',
  noun: 'Campaign Link',
  label: 'Create Campaign Link',
  description: 'Saves a tagged campaign link (with UTM parameters) in the campaign URL builder and returns the full URL.',
  operationId: 'links_create',
  sampleKey: 'link',
  fields: [SITE, ...inputFields('links_create', { omit: ['site_id'] })],
});

const addCampaignCost = makeCreate({
  key: 'add_campaign_cost',
  noun: 'Campaign Cost',
  label: 'Add Campaign Cost',
  description: "Records what a campaign cost in a month, for cost per acquisition and return on ad spend (Business plan).",
  operationId: 'campaign_costs_create',
  sampleKey: 'campaign_cost',
  fields: [
    SITE,
    ...inputFields('campaign_costs_create', {
      omit: ['site_id'],
      override: {
        campaign: { helpText: 'The utm_campaign value the cost belongs to, exactly as it arrives on the site.' },
        month: { type: 'datetime', helpText: 'The month the money was spent. Any day in it works, like 2026-10-01.' },
      },
    }),
  ],
  prepare: async (z, bundle) => ({ ...bundle.inputData, month: toMonth(bundle.inputData.month) }),
});

const createUptimeCheck = makeCreate({
  key: 'create_uptime_check',
  noun: 'Uptime Check',
  label: 'Create Uptime Check',
  description: 'Starts monitoring a URL, a keyword on a page, a TCP port or a DNS name for a site.',
  operationId: 'uptime_checks_create',
  sampleKey: 'uptime_check',
  fields: [SITE, ...inputFields('uptime_checks_create', { omit: ['site_id'] })],
});

const CHECK = dropdown('id', 'uptime_check_list.id.name', 'Uptime Check', { required: true });

const pauseUptimeCheck = makeCreate({
  key: 'pause_uptime_check',
  noun: 'Uptime Check',
  label: 'Pause or Resume Uptime Check',
  description: 'Pauses an uptime check (for planned maintenance) or resumes it.',
  operationId: 'uptime_checks_pause',
  sampleKey: 'uptime_check',
  fields: [
    SITE,
    CHECK,
    { key: 'action', label: 'Action', required: true, choices: { pause: 'Pause', resume: 'Resume' }, default: 'pause' },
  ],
});
// The same fields call one of two operations.
pauseUptimeCheck.operation.perform = async (z, bundle) => {
  const operation = bundle.inputData.action === 'resume' ? 'uptime_checks_resume' : 'uptime_checks_pause';
  return run(z, bundle, operation, { id: bundle.inputData.id });
};

const ALERT = dropdown('id', 'alert_list.id.name', 'Alert Rule', { required: true });

const acknowledgeAlert = makeCreate({
  key: 'acknowledge_alert',
  noun: 'Alert',
  label: 'Acknowledge Alert',
  description: "Acknowledges an alert rule's open incident, so the team knows someone is on it.",
  operationId: 'alerts_acknowledge',
  sampleKey: 'alert',
  fields: [ALERT],
});

const muteAlert = makeCreate({
  key: 'mute_alert',
  noun: 'Alert',
  label: 'Mute Alert',
  description: 'Silences the notifications of an alert rule for a number of minutes. It keeps recording incidents.',
  operationId: 'alerts_mute',
  sampleKey: 'alert',
  fields: [ALERT, ...inputFields('alerts_mute', { omit: ['id'] })],
});

const createStatusPost = makeCreate({
  key: 'create_status_page_post',
  noun: 'Status Update',
  label: 'Post Status Page Update',
  description: "Publishes an incident update on a status page and, by default, emails the page's subscribers.",
  operationId: 'status_page_posts_create',
  sampleKey: 'status_page_post',
  fields: [
    dropdown('status_page_id', 'status_page_list.id.name', 'Status Page', { required: true }),
    ...inputFields('status_page_posts_create', {
      omit: ['status_page_id'],
      override: { posted_at: { type: 'datetime', helpText: 'When it happened. Defaults to now. Posts are sorted by this time.' } },
    }),
  ],
});

const createExport = makeCreate({
  key: 'create_export',
  noun: 'Export',
  label: 'Create Export',
  description: 'Queues a data export (CSV, JSON, XLSX, NDJSON or a ZIP of dashboard panels). Use the Export Ready trigger to act when its file is ready.',
  operationId: 'exports_create',
  sampleKey: 'export',
  fields: [
    SITE,
    ...inputFields('exports_create', {
      omit: ['site_id', 'segment_id'],
      override: {
        from: { type: 'datetime', helpText: 'The first day to include.' },
        to: { type: 'datetime', helpText: 'The last day to include (inclusive). At most 400 days after the first (93 days for raw).' },
        filters: { helpText: 'A JSON list of filters, each [dimension, operator, value], like `[["country","is","US"]]`.' },
      },
    }),
    dropdown('segment_id', 'segment_list.id.name', 'Segment', { helpText: 'A saved segment. Its filters are added to the filters above.' }),
  ],
  prepare: async (z, bundle) => ({ ...bundle.inputData, from: toDate(bundle.inputData.from), to: toDate(bundle.inputData.to) }),
});

const inviteMember = makeCreate({
  key: 'invite_member',
  noun: 'Invitation',
  label: 'Invite Member',
  description: 'Invites people to the workspace by email. Each gets an invitation link valid for 14 days.',
  operationId: 'invitations_create',
  sampleKey: 'invitation',
  fields: inputFields('invitations_create', {
    omit: ['custom_role_id'],
    override: {
      site_ids: { dynamic: 'site_list.id.name', helpText: 'The sites they may open. Only used when All Sites is false.' },
      role: { default: 'viewer' },
    },
  }),
  // The response is a list (one invitation per address).
  shape: (result) => (Array.isArray(result) ? { invitations: result, count: result.length, ...(result[0] || {}) } : result),
});

const runSiteAudit = makeCreate({
  key: 'run_site_audit',
  noun: 'Site Audit',
  label: 'Run Site Audit',
  description: 'Starts an SEO audit of a site now. Use the Site Audit Completed trigger to act on the result.',
  operationId: 'site_audit_run',
  sampleKey: 'site_audit',
  fields: [SITE],
});

const EXPERIMENT_ACTIONS = { start: 'experiments_start', pause: 'experiments_pause', end: 'experiments_end' };

const controlExperiment = makeCreate({
  key: 'control_experiment',
  noun: 'Experiment',
  label: 'Start, Pause or End Experiment',
  description: 'Starts, pauses or ends an A/B or split URL experiment.',
  operationId: 'experiments_start',
  sampleKey: 'experiment',
  fields: [
    SITE,
    dropdown('id', 'experiment_list.id.name', 'Experiment', { required: true }),
    { key: 'action', label: 'Action', required: true, choices: { start: 'Start', pause: 'Pause', end: 'End' } },
  ],
});
controlExperiment.operation.perform = async (z, bundle) => {
  const operation = EXPERIMENT_ACTIONS[bundle.inputData.action];
  if (!operation) throw new z.errors.Error('Action must be start, pause or end.', 'InvalidInput', 400);
  return run(z, bundle, operation, compact({ site_id: bundle.inputData.site_id, id: bundle.inputData.id }));
};

module.exports = [
  createSite,
  createGoal,
  createNote,
  createWorkspaceNote,
  createCampaignLink,
  addCampaignCost,
  createUptimeCheck,
  pauseUptimeCheck,
  acknowledgeAlert,
  muteAlert,
  createStatusPost,
  createExport,
  inviteMember,
  runSiteAudit,
  controlExperiment,
];
