'use strict';

// The API operations (operationId in /openapi.json) this app calls. After a
// change here, run `npm run sync-spec` to refresh lib/spec.json.
module.exports = [
  // Connection, dropdowns and webhooks
  'workspaces_list',
  'account_get',
  'webhooks_create',
  'webhooks_delete',

  // Sites
  'sites_list',
  'sites_get',
  'sites_create',

  // Analytics
  'stats_aggregate',
  'stats_breakdown',
  'stats_timeseries',
  'live_get',

  // Goals, notes, segments
  'goals_list',
  'goals_create',
  'notes_list',
  'notes_create',
  'workspace_notes_create',
  'segments_list',

  // Alerts and uptime
  'alerts_list',
  'alerts_history',
  'alerts_acknowledge',
  'alerts_mute',
  'uptime_checks_list',
  'uptime_checks_create',
  'uptime_checks_pause',
  'uptime_checks_resume',
  'status_pages_list',
  'status_page_posts_create',

  // Campaigns
  'links_create',
  'campaign_costs_create',

  // Experiments, audits, exports, members
  'experiments_list',
  'experiments_get',
  'experiments_start',
  'experiments_pause',
  'experiments_end',
  'site_audit_run',
  'site_audit_get',
  'site_audit_history',
  'exports_list',
  'exports_create',
  'members_list',
  'invitations_create',

  // Testimonials
  'testimonials_list',
  'testimonials_get',
  'testimonials_create',
  'testimonials_update',
  'testimonials_approve',
  'testimonials_reject',
  'testimonials_pend',
  'testimonials_pin',
  'testimonial_people_list',
  'testimonial_people_create',
  'testimonial_forms_list',
  'testimonial_requests_list',
  'testimonial_request_recipients_create',
  'testimonial_tags_list',
  'testimonial_collections_list',
];
