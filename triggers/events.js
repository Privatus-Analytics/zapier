'use strict';

const { run, workspaceId } = require('../lib/api');
const { dropdown } = require('../lib/fields');
const { makeHookTrigger } = require('./hook');
const samples = require('../samples/webhooks.json');

// The site to read sample records from: the chosen one, or the first.
const sampleSite = async (z, bundle) => {
  if (bundle.inputData && bundle.inputData.site_id) return bundle.inputData.site_id;
  const sites = (await run(z, bundle, 'sites_list', { per_page: 1 })) || [];
  return sites[0] && sites[0].id;
};

const alertData = (alert) => ({
  alert_id: alert.id,
  name: alert.name,
  kind: alert.kind,
  site_id: alert.site_id,
  state: alert.state,
  value: null,
  message: alert.filters_summary || null,
  triggered_at: alert.last_triggered_at,
  resolved_at: null,
  __at: alert.last_triggered_at || alert.created_at,
});

const alertList = (kind, state) => async (z, bundle) =>
  ((await run(z, bundle, 'alerts_list', { kind, per_page: 10 })) || [])
    .filter((alert) => (state ? alert.state === state : true))
    .map(alertData);

const testimonialList = (status, extra) => async (z, bundle) => {
  const siteId = await sampleSite(z, bundle);
  if (!siteId) return [];
  const list = (await run(z, bundle, 'testimonials_list', { site_id: siteId, status: status ? [status] : undefined, per_page: 10 })) || [];
  return list.map((t) => ({ site_id: siteId, testimonial: t, ...extra(t), __at: t.created_at }));
};

const ALERT_FIELD = dropdown('alert_id', 'alert_list.id.name', 'Alert Rule', {
  helpText: 'Only fire for this alert rule. Leave empty for every rule.',
});
const byAlert = (item, input) => !input.alert_id || item.alert_id === input.alert_id;

const MIN_RATING = {
  key: 'min_rating',
  label: 'Minimum Rating',
  type: 'integer',
  choices: ['1', '2', '3', '4', '5'],
  helpText: 'Only fire for ratings of at least this many stars. Leave empty to fire for every one, with or without a rating.',
};
const ratingOf = (item) => (item.testimonial ? item.testimonial.rating : item.rating);
const byRating = (item, input) => !input.min_rating || (ratingOf(item) || 0) >= Number(input.min_rating);

const FORM_FIELD = dropdown('form_id', 'testimonial_form_list.id.name', 'Form', {
  helpText: 'Only fire for this form. Leave empty for every form of the site.',
});
const REQUEST_FIELD = dropdown('request_id', 'testimonial_request_list.id.name', 'Request', {
  helpText: 'Only fire for this request. Leave empty for every request of the site.',
});

const testimonialOutputs = [
  { key: 'id', label: 'Delivery ID' },
  { key: 'site_id', label: 'Site ID' },
  { key: 'testimonial__id', label: 'Testimonial ID' },
  { key: 'testimonial__status', label: 'Status' },
  { key: 'testimonial__kind', label: 'Kind' },
  { key: 'testimonial__rating', label: 'Rating', type: 'number' },
  { key: 'testimonial__title', label: 'Title' },
  { key: 'testimonial__body', label: 'Text' },
  { key: 'testimonial__person__name', label: 'Person Name' },
  { key: 'testimonial__person__title', label: 'Person Title' },
  { key: 'testimonial__person__company', label: 'Person Company' },
  { key: 'testimonial__source', label: 'Source' },
  { key: 'testimonial__permalink_url', label: 'Public Page URL' },
  { key: 'testimonial__received_at', label: 'Received At', type: 'datetime' },
];

const alertOutputs = [
  { key: 'id', label: 'Delivery ID' },
  { key: 'alert_id', label: 'Alert Rule ID' },
  { key: 'name', label: 'Alert Name' },
  { key: 'kind', label: 'Kind' },
  { key: 'site_id', label: 'Site ID' },
  { key: 'state', label: 'State' },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'message', label: 'Message' },
  { key: 'triggered_at', label: 'Triggered At', type: 'datetime' },
  { key: 'resolved_at', label: 'Resolved At', type: 'datetime' },
];

const uptimeOutputs = [
  { key: 'id', label: 'Delivery ID' },
  { key: 'check__id', label: 'Check ID' },
  { key: 'check__name', label: 'Check Name' },
  { key: 'check__url', label: 'Check URL' },
  { key: 'check__site_id', label: 'Site ID' },
  { key: 'check__status', label: 'Check Status' },
  { key: 'incident__cause', label: 'Cause' },
  { key: 'incident__started_at', label: 'Incident Started At', type: 'datetime' },
  { key: 'incident__resolved_at', label: 'Incident Resolved At', type: 'datetime' },
  { key: 'incident__duration_seconds', label: 'Incident Duration (Seconds)', type: 'number' },
];

const uptimeList = (status) => async (z, bundle) => {
  const workspace = await workspaceId(z, bundle);
  const checks = (await run(z, bundle, 'uptime_checks_list', { site_id: await sampleSite(z, bundle), status, per_page: 10 }).catch(() => [])) || [];
  return checks.map((check) => ({ check, incident: null, __at: check.last_checked_at, __workspace: workspace }));
};

const DEFINITIONS = [
  // Analytics alerts
  {
    key: 'alert_triggered',
    noun: 'Alert',
    label: 'Alert Triggered',
    description: 'Triggers when an alert rule fires: a traffic threshold, a spike or drop, a goal, a new referrer, no data, usage and more.',
    event: 'alert.triggered',
    siteFilter: true,
    fields: [ALERT_FIELD],
    matches: byAlert,
    list: alertList(undefined, 'triggered'),
    outputFields: alertOutputs,
  },
  {
    key: 'alert_resolved',
    noun: 'Alert',
    label: 'Alert Resolved',
    description: 'Triggers when an alert rule recovers.',
    event: 'alert.resolved',
    siteFilter: true,
    fields: [ALERT_FIELD],
    matches: byAlert,
    list: alertList(undefined, 'ok'),
    outputFields: alertOutputs,
  },
  {
    key: 'goal_alert_triggered',
    noun: 'Goal Alert',
    label: 'Goal Alert Triggered',
    description: 'Triggers when a goal alert rule fires (a goal reached, or fell under, its number of completions).',
    event: 'goal.completed_threshold',
    siteFilter: true,
    fields: [ALERT_FIELD],
    matches: byAlert,
    list: alertList('goal'),
    outputFields: alertOutputs,
  },
  {
    key: 'usage_threshold',
    noun: 'Usage Alert',
    label: 'Usage Threshold Reached',
    description: "Triggers when a usage alert fires because the workspace's monthly events passed a share of the plan's allowance.",
    event: 'usage.threshold',
    list: alertList('usage'),
    outputFields: alertOutputs,
  },

  // Uptime
  {
    key: 'uptime_down',
    noun: 'Uptime Check',
    label: 'Uptime Check Down',
    description: 'Triggers when an uptime check starts failing.',
    event: 'uptime.down',
    siteFilter: true,
    list: uptimeList('down'),
    outputFields: uptimeOutputs,
  },
  {
    key: 'uptime_up',
    noun: 'Uptime Check',
    label: 'Uptime Check Recovered',
    description: 'Triggers when a failing uptime check is back up.',
    event: 'uptime.up',
    siteFilter: true,
    list: uptimeList('up'),
    outputFields: uptimeOutputs,
  },

  // Workspace
  {
    key: 'site_created',
    noun: 'Site',
    label: 'New Site',
    description: 'Triggers when a site is added to the workspace.',
    event: 'site.created',
    list: async (z, bundle) =>
      ((await run(z, bundle, 'sites_list', { per_page: 10 })) || []).map((s) => ({ site_id: s.id, domain: s.domain, __at: s.created_at })),
    outputFields: [
      { key: 'id', label: 'Delivery ID' },
      { key: 'site_id', label: 'Site ID' },
      { key: 'domain', label: 'Domain' },
    ],
  },
  {
    key: 'site_deleted',
    noun: 'Site',
    label: 'Site Deleted',
    description: 'Triggers when a site is deleted from the workspace.',
    event: 'site.deleted',
    outputFields: [
      { key: 'id', label: 'Delivery ID' },
      { key: 'site_id', label: 'Site ID' },
      { key: 'domain', label: 'Domain' },
    ],
  },
  {
    key: 'member_added',
    noun: 'Member',
    label: 'New Member',
    description: 'Triggers when someone joins the workspace (an accepted invitation, single sign-on or SCIM).',
    event: 'member.added',
    list: async (z, bundle) =>
      ((await run(z, bundle, 'members_list', { per_page: 10 })) || []).map((m) => ({ email: m.email, role: m.role, joined_at: m.created_at, __at: m.created_at })),
    outputFields: [
      { key: 'id', label: 'Delivery ID' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'joined_at', label: 'Joined At', type: 'datetime' },
    ],
  },
  {
    key: 'export_ready',
    noun: 'Export',
    label: 'Export Ready',
    description: 'Triggers when an export has finished and its file is ready to download.',
    event: 'export.ready',
    idKey: 'export_id',
    siteFilter: true,
    list: async (z, bundle) => ((await run(z, bundle, 'exports_list', { status: 'complete', per_page: 10 })) || []).map((e) => ({ ...e, __at: e.completed_at })),
    outputFields: [
      { key: 'id', label: 'Delivery ID' },
      { key: 'export_id', label: 'Export ID' },
      { key: 'site_id', label: 'Site ID' },
      { key: 'kind', label: 'Kind' },
      { key: 'format', label: 'Format' },
      { key: 'row_count', label: 'Rows', type: 'number' },
      { key: 'download_url', label: 'Download Path' },
      { key: 'expires_at', label: 'Expires At', type: 'datetime' },
    ],
  },
  {
    key: 'import_completed',
    noun: 'Import',
    label: 'Analytics Import Completed',
    description: 'Triggers when an import of analytics history (from Google Analytics or a file) finishes.',
    event: 'import.completed',
    siteFilter: true,
  },
  {
    key: 'import_failed',
    noun: 'Import',
    label: 'Analytics Import Failed',
    description: 'Triggers when an import of analytics history fails.',
    event: 'import.failed',
    siteFilter: true,
  },
  {
    key: 'site_audit_completed',
    noun: 'Site Audit',
    label: 'Site Audit Completed',
    description: 'Triggers when an SEO site audit finishes, with its score and the issues found and fixed.',
    event: 'site_audit.completed',
    siteFilter: true,
    list: async (z, bundle) => {
      const siteId = await sampleSite(z, bundle);
      if (!siteId) return [];
      const audits = (await run(z, bundle, 'site_audit_history', { site_id: siteId, per_page: 10 })) || [];
      return audits.map((a) => ({
        site_id: siteId,
        audit_id: a.id,
        status: a.status,
        score: a.score,
        pages_crawled: a.pages_crawled,
        errors: a.errors,
        warnings: a.warnings,
        notices: a.notices,
        new_issues: a.new_issues,
        fixed_issues: a.fixed_issues,
        __at: a.finished_at || a.created_at,
      }));
    },
    outputFields: [
      { key: 'id', label: 'Delivery ID' },
      { key: 'site_id', label: 'Site ID' },
      { key: 'audit_id', label: 'Audit ID' },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'errors', label: 'Errors', type: 'number' },
      { key: 'warnings', label: 'Warnings', type: 'number' },
      { key: 'new_issues', label: 'New Issues', type: 'number' },
      { key: 'fixed_issues', label: 'Fixed Issues', type: 'number' },
    ],
  },
  {
    key: 'experiment_ended',
    noun: 'Experiment',
    label: 'Experiment Ended',
    description: 'Triggers when an A/B or split URL experiment ends, with or without a winner, with the results of every variant.',
    event: 'experiment.ended',
    siteFilter: true,
    outputFields: [
      { key: 'id', label: 'Delivery ID' },
      { key: 'site_id', label: 'Site ID' },
      { key: 'experiment_id', label: 'Experiment ID' },
      { key: 'name', label: 'Experiment Name' },
      { key: 'end_reason', label: 'End Reason' },
      { key: 'winner__name', label: 'Winner Name' },
    ],
  },

  // Testimonials
  {
    key: 'testimonial_received',
    noun: 'Testimonial',
    label: 'New Testimonial',
    description: 'Triggers when a testimonial arrives through a form, a request, the API, the browser extension or by hand.',
    event: 'testimonial.received',
    siteFilter: true,
    fields: [MIN_RATING],
    matches: byRating,
    list: testimonialList(undefined, (t) => ({ source: t.source, held_for_allowance: Boolean(t.waiting_for_allowance) })),
    outputFields: testimonialOutputs,
  },
  {
    key: 'testimonial_approved',
    noun: 'Testimonial',
    label: 'Testimonial Approved',
    description: 'Triggers when a testimonial is approved, so it can be shown on walls and widgets.',
    event: 'testimonial.approved',
    siteFilter: true,
    fields: [MIN_RATING],
    matches: byRating,
    list: testimonialList('approved', () => ({ approved_by: null })),
    outputFields: testimonialOutputs,
  },
  {
    key: 'testimonial_rejected',
    noun: 'Testimonial',
    label: 'Testimonial Rejected',
    description: 'Triggers when a testimonial is rejected.',
    event: 'testimonial.rejected',
    siteFilter: true,
    list: testimonialList('rejected', () => ({ rejected_by: null })),
    outputFields: testimonialOutputs,
  },
  {
    key: 'testimonial_restored',
    noun: 'Testimonial',
    label: 'Testimonial Restored',
    description: 'Triggers when a testimonial is restored from the trash.',
    event: 'testimonial.restored',
    siteFilter: true,
    outputFields: testimonialOutputs,
  },
  {
    key: 'testimonial_trashed',
    noun: 'Testimonial',
    label: 'Testimonial Moved to Trash',
    description: 'Triggers when a testimonial is moved to the trash.',
    event: 'testimonial.trashed',
    siteFilter: true,
  },
  {
    key: 'testimonial_deleted',
    noun: 'Testimonial',
    label: 'Testimonial Deleted',
    description: 'Triggers when a testimonial is deleted permanently, by a person or when the trash is emptied.',
    event: 'testimonial.deleted',
    siteFilter: true,
  },
  {
    key: 'testimonial_form_submitted',
    noun: 'Form Submission',
    label: 'Testimonial Form Submitted',
    description: 'Triggers when someone completes a testimonial form, whether it became a testimonial or private feedback. Never includes their email address.',
    event: 'testimonial_form.submitted',
    siteFilter: true,
    fields: [FORM_FIELD, MIN_RATING],
    matches: (item, input) => (!input.form_id || item.form_id === input.form_id) && byRating(item, input),
    outputFields: [
      { key: 'id', label: 'Delivery ID' },
      { key: 'site_id', label: 'Site ID' },
      { key: 'form_id', label: 'Form ID' },
      { key: 'testimonial_id', label: 'Testimonial ID' },
      { key: 'kind', label: 'Kind' },
      { key: 'rating', label: 'Rating', type: 'number' },
      { key: 'routed_to_private_feedback', label: 'Went to Private Feedback', type: 'boolean' },
    ],
  },
  {
    key: 'testimonial_request_sent',
    noun: 'Testimonial Request',
    label: 'Testimonial Request Sent',
    description: 'Triggers when the first emails of a testimonial request go out.',
    event: 'testimonial_request.sent',
    siteFilter: true,
    fields: [REQUEST_FIELD],
    matches: (item, input) => !input.request_id || item.request_id === input.request_id,
  },
  {
    key: 'testimonial_request_completed',
    noun: 'Testimonial Request',
    label: 'Testimonial Request Finished',
    description: 'Triggers when a testimonial request finishes: every person replied, opted out or got every email.',
    event: 'testimonial_request.completed',
    siteFilter: true,
    fields: [REQUEST_FIELD],
    matches: (item, input) => !input.request_id || item.request_id === input.request_id,
  },
  {
    key: 'testimonial_import_finished',
    noun: 'Testimonial Import',
    label: 'Testimonial Import Finished',
    description: 'Triggers when an import of testimonials or reviews finishes reading, or fails.',
    event: 'testimonial_import.finished',
    siteFilter: true,
  },
  {
    key: 'testimonial_sync_new_found',
    noun: 'Review Sync',
    label: 'New Reviews Found by Sync',
    description: 'Triggers when an automatic sync of a review platform stores new reviews.',
    event: 'testimonial_sync.new_found',
    siteFilter: true,
  },
];

const triggers = DEFINITIONS.map((def) => makeHookTrigger({ ...def, sample: samples[def.event] }));

module.exports = { DEFINITIONS, triggers };
