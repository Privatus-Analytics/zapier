'use strict';

// Sample records shown in the Zap editor. Webhook payloads are ASSUMED
// (see README "Webhook API").

const site = {
  id: 'pa_7Q2K9XH3AB',
  workspace_id: 'ws_7Q2K9XH3AB',
  domain: 'example.com',
  name: 'Example',
  timezone: 'Europe/Berlin',
  currency: 'EUR',
  extra_domains: [],
  created_at: '2026-01-15T09:30:00Z',
};

const goal = {
  id: 'goal_4M8P2QX7KD',
  name: 'Signup',
  kind: 'event',
  match_type: 'exact',
  pattern: null,
  event_name: 'signup',
  value_mode: 'fixed',
  fixed_value: 25,
  count_mode: 'once_per_visit',
  archived: false,
};

const goalCompleted = {
  id: 'whd_9H2K4M6P8R',
  event: 'goal.completed',
  created_at: '2026-09-29T10:15:02Z',
  workspace_id: 'ws_7Q2K9XH3AB',
  site_id: site.id,
  site_domain: site.domain,
  site_name: site.name,
  goal_id: goal.id,
  goal_name: goal.name,
  goal_kind: goal.kind,
  occurred_at: '2026-09-29T10:15:00Z',
  page: '/pricing',
  event_name: 'signup',
  revenue: 25,
  currency: 'EUR',
  channel: 'Organic Search',
  source: 'google.com',
  country: 'DE',
  device: 'Desktop',
  props: { plan: 'pro' },
};

const alertTriggered = {
  id: 'whd_3C5E7G9J1L',
  event: 'alert.triggered',
  created_at: '2026-09-29T10:00:05Z',
  workspace_id: 'ws_7Q2K9XH3AB',
  site_id: site.id,
  site_domain: site.domain,
  site_name: site.name,
  alert_id: 'alert_2B4D6F8H0K',
  alert_name: 'Traffic spike',
  alert_kind: 'anomaly',
  metric: 'visitors',
  comparison: 'above',
  threshold: 500,
  value: 1284,
  period_from: '2026-09-29T09:00:00Z',
  period_to: '2026-09-29T10:00:00Z',
  dashboard_url: 'https://privatusanalytics.com/sites/pa_7Q2K9XH3AB/overview?period=today',
};

const workspace = { id: 'ws_7Q2K9XH3AB', name: 'Acme Inc.', timezone: 'Europe/Berlin', currency: 'EUR', plan: 'pro' };

const note = {
  id: 'note_5N7Q9S1U3W',
  site_id: site.id,
  date: '2026-09-29',
  end_date: null,
  title: 'Launched new pricing page',
  body: 'A/B test variant B shipped to 100%.',
  url: 'https://example.com/pricing',
  color: 'brand',
  created_at: '2026-09-29T10:20:00Z',
};

module.exports = { site, goal, goalCompleted, alertTriggered, workspace, note };
