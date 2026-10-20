'use strict';

const { enc, normalizeDomain, run, toDate, url } = require('../lib/api');
const { inputFields, SITE, dropdown } = require('../lib/fields');
const { makeSearch } = require('../lib/actions');

const lower = (s) => String(s || '').trim().toLowerCase();

// ---------- Period fields shared by the stats searches ----------

const PERIOD_FIELDS = [
  {
    key: 'period',
    label: 'Period',
    required: true,
    default: '7d',
    choices: {
      today: 'Today',
      yesterday: 'Yesterday',
      '24h': 'Last 24 hours',
      '7d': 'Last 7 days',
      '14d': 'Last 14 days',
      '28d': 'Last 28 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
      mtd: 'Month to date',
      last_month: 'Last month',
      qtd: 'Quarter to date',
      last_quarter: 'Last quarter',
      ytd: 'Year to date',
      '12mo': 'Last 12 months',
      last_year: 'Last year',
      all: 'All time',
      custom: 'Custom (use From and To)',
    },
    helpText: "In the site's time zone. Today and the periods ending today include today so far.",
  },
  { key: 'from', label: 'From', type: 'datetime', helpText: 'First day, for a custom period.' },
  { key: 'to', label: 'To', type: 'datetime', helpText: 'Last day (inclusive), for a custom period.' },
  {
    key: 'filters',
    label: 'Filters',
    type: 'text',
    helpText:
      'Optional. A JSON list of conditions that must all match, each [dimension, operator, value], like `[["country","is","US"],["page","starts_with","/blog"]]`. See privatusanalytics.com/docs/api/filters.',
  },
  dropdown('segment_id', 'segment_list.id.name', 'Segment', { helpText: 'Optional. A saved segment, added to the filters.' }),
];

const periodValues = (input) => ({
  site_id: input.site_id,
  period: input.period || '7d',
  from: input.period === 'custom' ? toDate(input.from) : undefined,
  to: input.period === 'custom' ? toDate(input.to) : undefined,
  filters: input.filters,
  segment_id: input.segment_id,
});

const METRICS = ['visitors', 'visits', 'pageviews', 'views_per_visit', 'bounce_rate', 'visit_duration', 'revenue'];

/** Flat fields for one set of metrics, with friendly units next to the raw ones. */
const flatMetrics = (metrics, prefix = '') => {
  const out = {};
  METRICS.forEach((name) => {
    out[`${prefix}${name}`] = metrics ? metrics[name] : null;
  });
  if (metrics) {
    out[`${prefix}visit_duration_seconds`] = metrics.visit_duration == null ? null : Math.round(metrics.visit_duration / 1000);
    out[`${prefix}revenue_amount`] = metrics.revenue == null ? null : metrics.revenue / 100;
  }
  return out;
};

const METRIC_OUTPUTS = [
  { key: 'visitors', label: 'Visitors', type: 'number' },
  { key: 'visits', label: 'Visits', type: 'number' },
  { key: 'pageviews', label: 'Pageviews', type: 'number' },
  { key: 'views_per_visit', label: 'Views per Visit', type: 'number' },
  { key: 'bounce_rate', label: 'Bounce Rate (%)', type: 'number' },
  { key: 'visit_duration_seconds', label: 'Visit Duration (Seconds)', type: 'number' },
  { key: 'revenue_amount', label: 'Revenue (Site Currency)', type: 'number' },
];

// ---------- Sites ----------

const findSite = makeSearch({
  key: 'find_site',
  noun: 'Site',
  label: 'Find Site',
  description: 'Finds a site by its domain (its main domain or an extra one).',
  operationId: 'sites_get',
  sampleKey: 'site',
  fields: [{ key: 'domain', label: 'Domain', required: true, helpText: 'Like example.com. A full address works too.' }],
  perform: async (z, bundle) => {
    const domain = normalizeDomain(bundle.inputData.domain);
    if (!domain) return [];
    const sites = (await run(z, bundle, 'sites_list', { query: domain, per_page: 100 })) || [];
    const exact = sites.filter(
      (site) => lower(site.domain) === domain || (site.extra_domains || []).map(lower).includes(domain)
    );
    return exact;
  },
});

// ---------- Analytics ----------

const getStats = makeSearch({
  key: 'get_site_stats',
  noun: 'Stats',
  label: 'Get Site Stats',
  description:
    'Gets the visitors, visits, pageviews, bounce rate, visit duration and revenue of a site for a period, optionally compared with the previous one. Pair it with Schedule by Zapier for a daily or weekly report.',
  fields: [
    SITE,
    ...PERIOD_FIELDS,
    {
      key: 'compare',
      label: 'Compare With',
      choices: { none: 'Nothing', previous_period: 'The previous period', previous_year: 'The same period a year earlier' },
      default: 'none',
    },
  ],
  perform: async (z, bundle) => {
    const input = bundle.inputData;
    const data = await run(z, bundle, 'stats_aggregate', { ...periodValues(input), compare: input.compare || 'none' });
    const result = {
      id: `${input.site_id}:${data.period.from}:${data.period.to}`,
      site_id: input.site_id,
      from: data.period.from,
      to: data.period.to,
      ...flatMetrics(data.metrics),
    };
    if (data.comparison) {
      Object.assign(result, flatMetrics(data.comparison, 'previous_'));
      METRICS.forEach((name) => {
        result[`change_${name}`] = data.change ? data.change[name] : null;
      });
      result.previous_from = data.comparison_period && data.comparison_period.from;
      result.previous_to = data.comparison_period && data.comparison_period.to;
    }
    return [result];
  },
  sample: {
    id: 'pa_7Q2K9XH3AB:2026-10-13T00:00:00Z:2026-10-20T00:00:00Z',
    site_id: 'pa_7Q2K9XH3AB',
    from: '2026-10-13T00:00:00Z',
    to: '2026-10-20T00:00:00Z',
    visitors: 4120,
    visits: 5233,
    pageviews: 11890,
    views_per_visit: 2.27,
    bounce_rate: 41.2,
    visit_duration: 96000,
    visit_duration_seconds: 96,
    revenue: 125000,
    revenue_amount: 1250,
    change_visitors: 12.4,
  },
  outputFields: [
    { key: 'from', label: 'From', type: 'datetime' },
    { key: 'to', label: 'To', type: 'datetime' },
    ...METRIC_OUTPUTS,
    { key: 'previous_visitors', label: 'Previous Visitors', type: 'number' },
    { key: 'change_visitors', label: 'Visitors Change (%)', type: 'number' },
    { key: 'change_pageviews', label: 'Pageviews Change (%)', type: 'number' },
  ],
});

const DIMENSIONS = {
  page: 'Pages',
  entry_page: 'Entry pages',
  exit_page: 'Exit pages',
  channel: 'Channels',
  referrer: 'Referrers',
  utm_source: 'UTM sources',
  utm_medium: 'UTM mediums',
  utm_campaign: 'UTM campaigns',
  utm_content: 'UTM contents',
  utm_term: 'UTM terms',
  country: 'Countries',
  language: 'Languages',
  device: 'Devices',
  browser: 'Browsers',
  os: 'Operating systems',
  hostname: 'Hostnames',
  event: 'Custom events',
  goal: 'Goals',
};

const getBreakdown = makeSearch({
  key: 'get_top_values',
  noun: 'Top List',
  label: 'Get Top Pages, Sources or Countries',
  description: 'Gets the top values of one report (pages, referrers, campaigns, countries, devices, events, goals and more) for a period.',
  fields: [
    SITE,
    {
      key: 'dimension',
      label: 'Report',
      required: true,
      choices: DIMENSIONS,
      default: 'page',
      helpText: 'For a custom event property, choose Custom and enter prop:<key>, like prop:plan.',
    },
    ...PERIOD_FIELDS,
    { key: 'limit', label: 'How Many', type: 'integer', default: '10', helpText: 'From 1 to 100.' },
    {
      key: 'sort',
      label: 'Sort By',
      choices: { visitors: 'Visitors', visits: 'Visits', pageviews: 'Pageviews', revenue: 'Revenue' },
    },
  ],
  perform: async (z, bundle) => {
    const input = bundle.inputData;
    const limit = Math.min(Math.max(parseInt(input.limit, 10) || 10, 1), 100);
    const data = await run(z, bundle, 'stats_breakdown', { ...periodValues(input), dimension: input.dimension, limit, sort: input.sort });
    const rows = (data.rows || []).map((row, i) => ({ rank: i + 1, ...row }));
    const summary = rows.map((row) => `${row.rank}. ${row.value}: ${row.visitors ?? row.pageviews ?? row.completions ?? ''}`).join('\n');
    return [
      {
        id: `${input.site_id}:${input.dimension}:${data.period.from}:${data.period.to}`,
        site_id: input.site_id,
        report: data.label || input.dimension,
        from: data.period.from,
        to: data.period.to,
        count: rows.length,
        top_value: rows[0] ? rows[0].value : null,
        summary,
        rows,
      },
    ];
  },
  sample: {
    id: 'pa_7Q2K9XH3AB:page:2026-10-13T00:00:00Z:2026-10-20T00:00:00Z',
    site_id: 'pa_7Q2K9XH3AB',
    report: 'Page',
    from: '2026-10-13T00:00:00Z',
    to: '2026-10-20T00:00:00Z',
    count: 2,
    top_value: '/',
    summary: '1. /: 1820\n2. /pricing: 640',
    rows: [
      { rank: 1, value: '/', visitors: 1820, visits: 2010, pageviews: 2600, share: 44.2 },
      { rank: 2, value: '/pricing', visitors: 640, visits: 700, pageviews: 910, share: 15.5 },
    ],
  },
  outputFields: [
    { key: 'report', label: 'Report' },
    { key: 'count', label: 'Rows', type: 'number' },
    { key: 'top_value', label: 'Top Value' },
    { key: 'summary', label: 'Summary (One Line Each)' },
    { key: 'rows[]value', label: 'Row Value' },
    { key: 'rows[]visitors', label: 'Row Visitors', type: 'number' },
    { key: 'rows[]share', label: 'Row Share (%)', type: 'number' },
  ],
});

const getTimeseries = makeSearch({
  key: 'get_site_timeseries',
  noun: 'Time Series',
  label: 'Get Daily Stats',
  description: 'Gets the visitors, visits and pageviews of a site for each day (or hour, week or month) of a period, as line items.',
  fields: [
    SITE,
    ...PERIOD_FIELDS,
    {
      key: 'interval',
      label: 'Interval',
      choices: { auto: 'Automatic', hour: 'Hour', day: 'Day', week: 'Week', month: 'Month' },
      default: 'day',
    },
  ],
  perform: async (z, bundle) => {
    const input = bundle.inputData;
    const data = await run(z, bundle, 'stats_timeseries', { ...periodValues(input), interval: input.interval || 'day' });
    const series = data.series || [];
    const total = (name) => series.reduce((sum, point) => sum + (point[name] || 0), 0);
    return [
      {
        id: `${input.site_id}:${data.interval}:${data.period.from}:${data.period.to}`,
        site_id: input.site_id,
        interval: data.interval,
        from: data.period.from,
        to: data.period.to,
        total_visits: total('visits'),
        total_pageviews: total('pageviews'),
        series,
      },
    ];
  },
  sample: {
    id: 'pa_7Q2K9XH3AB:day:2026-10-18T00:00:00Z:2026-10-20T00:00:00Z',
    site_id: 'pa_7Q2K9XH3AB',
    interval: 'day',
    from: '2026-10-18T00:00:00Z',
    to: '2026-10-20T00:00:00Z',
    total_visits: 1490,
    total_pageviews: 3380,
    series: [
      { date: '2026-10-18T00:00:00Z', visitors: 610, visits: 720, pageviews: 1650, bounce_rate: 40.1, visit_duration: 91000, revenue: 0 },
      { date: '2026-10-19T00:00:00Z', visitors: 655, visits: 770, pageviews: 1730, bounce_rate: 39.4, visit_duration: 99000, revenue: 4900 },
    ],
  },
  outputFields: [
    { key: 'interval', label: 'Interval' },
    { key: 'total_visits', label: 'Total Visits', type: 'number' },
    { key: 'total_pageviews', label: 'Total Pageviews', type: 'number' },
    { key: 'series[]date', label: 'Date', type: 'datetime' },
    { key: 'series[]visitors', label: 'Visitors', type: 'number' },
    { key: 'series[]pageviews', label: 'Pageviews', type: 'number' },
  ],
});

const getLive = makeSearch({
  key: 'get_live_visitors',
  noun: 'Live Visitors',
  label: 'Get Live Visitors',
  description: 'Gets how many visitors are on a site right now (the last 30 minutes).',
  fields: [SITE],
  perform: async (z, bundle) => {
    const data = await run(z, bundle, 'live_get', { site_id: bundle.inputData.site_id, limit: 10 });
    return [
      {
        id: `${bundle.inputData.site_id}:${new Date().toISOString().slice(0, 16)}`,
        site_id: bundle.inputData.site_id,
        live_visitors: data.live_visitors,
        window_minutes: data.window_minutes,
        checked_at: new Date().toISOString(),
      },
    ];
  },
  sample: { id: 'pa_7Q2K9XH3AB:2026-10-20T10:15', site_id: 'pa_7Q2K9XH3AB', live_visitors: 23, window_minutes: 30, checked_at: '2026-10-20T10:15:00Z' },
  outputFields: [
    { key: 'live_visitors', label: 'Live Visitors', type: 'number' },
    { key: 'window_minutes', label: 'Window (Minutes)', type: 'number' },
    { key: 'checked_at', label: 'Checked At', type: 'datetime' },
  ],
});

// ---------- Goals ----------

const findGoal = makeSearch({
  key: 'find_goal',
  noun: 'Goal',
  label: 'Find Goal',
  description: 'Finds a goal of a site by its name, with its completions for a period.',
  operationId: 'goals_list',
  sampleKey: 'goal',
  fields: [
    SITE,
    { key: 'name', label: 'Name', required: true, helpText: 'The goal name, not case sensitive.' },
    { ...PERIOD_FIELDS[0], required: false, default: '30d', helpText: 'The period of the completions in Stats.' },
    {
      key: 'include_archived',
      label: 'Include Archived Goals',
      type: 'boolean',
      default: 'false',
    },
  ],
  perform: async (z, bundle) => {
    const input = bundle.inputData;
    const status = String(input.include_archived) === 'true' ? 'all' : 'active';
    const goals = (await run(z, bundle, 'goals_list', { site_id: input.site_id, period: input.period || '30d', status, per_page: 100 })) || [];
    return goals.filter((goal) => lower(goal.name) === lower(input.name));
  },
});

// ---------- Uptime, alerts, audits, experiments ----------

const findUptimeCheck = makeSearch({
  key: 'find_uptime_check',
  noun: 'Uptime Check',
  label: 'Find Uptime Check',
  description: 'Finds an uptime check of a site by its name or URL, with its status and uptime.',
  operationId: 'uptime_checks_list',
  sampleKey: 'uptime_check',
  fields: [SITE, { key: 'query', label: 'Name or URL', required: true }, ...inputFields('uptime_checks_list', { only: ['status'] })],
  perform: async (z, bundle) => (await run(z, bundle, 'uptime_checks_list', { ...bundle.inputData, per_page: 25 })) || [],
});

const findAlert = makeSearch({
  key: 'find_alert',
  noun: 'Alert Rule',
  label: 'Find Alert Rule',
  description: 'Finds an alert rule by its name, with its state (ok or triggered).',
  operationId: 'alerts_list',
  sampleKey: 'alert',
  fields: [
    { key: 'name', label: 'Name', required: true, helpText: 'Part of the rule name, not case sensitive.' },
    { ...SITE, required: false, altersDynamicFields: false, helpText: 'Only rules of this site.' },
    ...inputFields('alerts_list', { only: ['state', 'kind'] }),
  ],
  perform: async (z, bundle) => {
    const input = bundle.inputData;
    const alerts = (await run(z, bundle, 'alerts_list', { site_id: input.site_id, state: input.state, kind: input.kind, per_page: 100 })) || [];
    return alerts.filter((alert) => lower(alert.name).includes(lower(input.name)));
  },
});

const getSiteAudit = makeSearch({
  key: 'get_site_audit',
  noun: 'Site Audit',
  label: 'Get Latest Site Audit',
  description: 'Gets the latest finished SEO audit of a site: its score, the pages crawled and the issues found and fixed.',
  operationId: 'site_audit_history',
  sampleKey: 'site_audit',
  fields: [SITE],
  perform: async (z, bundle) => {
    const audits = (await run(z, bundle, 'site_audit_history', { site_id: bundle.inputData.site_id, status: 'complete', per_page: 1 })) || [];
    return audits.slice(0, 1);
  },
});

const findExperiment = makeSearch({
  key: 'find_experiment',
  noun: 'Experiment',
  label: 'Find Experiment',
  description: 'Finds an experiment of a site by its name, with its status, variants and results.',
  operationId: 'experiments_list',
  sampleKey: 'experiment',
  fields: [SITE, { key: 'name', label: 'Name', required: true, helpText: 'Part of the experiment name, not case sensitive.' }],
  perform: async (z, bundle) => {
    const list = (await run(z, bundle, 'experiments_list', { site_id: bundle.inputData.site_id, status: 'all', per_page: 100 })) || [];
    return list.filter((e) => lower(e.name).includes(lower(bundle.inputData.name)));
  },
});

const findMember = makeSearch({
  key: 'find_member',
  noun: 'Member',
  label: 'Find Member',
  description: 'Finds a member of the workspace by email, with their role.',
  operationId: 'members_list',
  sampleKey: 'member',
  fields: [{ key: 'email', label: 'Email', required: true }],
  perform: async (z, bundle) => {
    const email = lower(bundle.inputData.email);
    const members = (await run(z, bundle, 'members_list', { query: email, per_page: 100 })) || [];
    return members.filter((m) => lower(m.email) === email);
  },
});

// ---------- Testimonials ----------

const findTestimonial = makeSearch({
  key: 'find_testimonial',
  noun: 'Testimonial',
  label: 'Find Testimonial',
  description: 'Finds testimonials of a site by their words or the person who gave them, newest first.',
  operationId: 'testimonials_list',
  sampleKey: 'testimonial',
  fields: [
    SITE,
    { key: 'q', label: 'Search', helpText: "Words in the testimonial or the person's name or company." },
    {
      key: 'status',
      label: 'Status',
      choices: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' },
      helpText: 'Leave empty for every status.',
    },
    { key: 'min_rating', label: 'Minimum Rating', type: 'integer', choices: ['1', '2', '3', '4', '5'] },
    dropdown('tag_id', 'testimonial_tag_list.id.name', 'Tag'),
  ],
  perform: async (z, bundle) => {
    const input = bundle.inputData;
    const minimum = parseInt(input.min_rating, 10);
    const rating = minimum ? ['1', '2', '3', '4', '5'].filter((r) => Number(r) >= minimum) : undefined;
    return (
      (await run(z, bundle, 'testimonials_list', {
        site_id: input.site_id,
        q: input.q,
        status: input.status ? [input.status] : undefined,
        rating,
        tag_id: input.tag_id ? [input.tag_id] : undefined,
        sort: input.q ? 'relevance' : 'received_desc',
        per_page: 25,
      })) || []
    );
  },
});

const getTestimonial = makeSearch({
  key: 'get_testimonial',
  noun: 'Testimonial',
  label: 'Get Testimonial by ID',
  description: 'Gets one testimonial with everything about it, such as the person, the media and the tags.',
  operationId: 'testimonials_get',
  sampleKey: 'testimonial',
  fields: [SITE, { key: 'id', label: 'Testimonial', required: true, dynamic: 'testimonial_list.id.name', helpText: 'The testimonial (tm_...). The list shows the newest ones.' }],
  perform: async (z, bundle) => {
    const response = await z.request({
      url: url(`/sites/${enc(bundle.inputData.site_id)}/testimonials/${enc(bundle.inputData.id)}.json`),
      skipThrowForStatus: true,
    });
    if (response.status === 404) return [];
    response.throwForStatus();
    return [response.data.data];
  },
});

const findPerson = makeSearch({
  key: 'find_testimonial_person',
  noun: 'Person',
  label: 'Find Testimonial Person',
  description: 'Finds a person of a site (someone who gives testimonials) by email or name.',
  operationId: 'testimonial_people_list',
  sampleKey: 'person',
  fields: [SITE, { key: 'query', label: 'Email or Name', required: true }],
  perform: async (z, bundle) => {
    const query = lower(bundle.inputData.query);
    const people = (await run(z, bundle, 'testimonial_people_list', { site_id: bundle.inputData.site_id, query, per_page: 25 })) || [];
    // An email matches exactly; a name is whatever the API found.
    return query.includes('@') ? people.filter((p) => lower(p.email) === query) : people;
  },
});

module.exports = [
  findSite,
  getStats,
  getBreakdown,
  getTimeseries,
  getLive,
  findGoal,
  findUptimeCheck,
  findAlert,
  getSiteAudit,
  findExperiment,
  findMember,
  findTestimonial,
  getTestimonial,
  findPerson,
];
