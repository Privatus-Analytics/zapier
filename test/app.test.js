'use strict';

const nock = require('nock');
const zapier = require('zapier-platform-core');
const App = require('../index');
const { toItem } = require('../triggers/hook');

const appTester = zapier.createAppTester(App);
const API = 'https://privatusanalytics.com';
const authData = { api_token: 'pat_test' };
const WORKSPACES = { data: [{ id: 'ws_1', name: 'Acme Inc', plan: 'pro', role: 'owner' }] };

const create = (key, inputData) => appTester(App.creates[key].operation.perform, { authData, inputData });
const search = (key, inputData) => appTester(App.searches[key].operation.perform, { authData, inputData });
const trigger = (key, method, bundle) => appTester(App.triggers[key].operation[method], { authData, ...bundle });

beforeAll(() => nock.disableNetConnect());
afterEach(() => {
  const pending = nock.pendingMocks();
  nock.cleanAll();
  expect(pending).toEqual([]);
});
afterAll(() => nock.enableNetConnect());

describe('authentication', () => {
  it('sends the token and labels the connection with the workspace', async () => {
    nock(API).get('/workspaces.json').matchHeader('authorization', 'Bearer pat_test').reply(200, WORKSPACES);
    const result = await appTester(App.authentication.test, { authData });
    expect(result).toMatchObject({ workspace_id: 'ws_1', workspace_name: 'Acme Inc' });
    expect(App.authentication.connectionLabel).toBe('{{bundle.inputData.workspace_name}}');
  });

  it('marks the connection expired when the token is refused', async () => {
    nock(API).get('/workspaces.json').reply(401, { error: { code: 'unauthorized', message: 'That API token is invalid, revoked or expired.' } });
    await expect(appTester(App.authentication.test, { authData })).rejects.toThrow(/token was refused/);
  });
});

describe('requests built from the spec', () => {
  it('sends only documented inputs, typed, in the JSON body', async () => {
    nock(API)
      .post('/sites/pa_1/goals.json', { name: 'Signup', kind: 'event', event_name: 'Signup', value_mode: 'fixed', fixed_value: 49.5 })
      .reply(201, { data: { id: 'goal_1', name: 'Signup' } });
    const goal = await create('create_goal', {
      site_id: 'pa_1', name: 'Signup', kind: 'event', event_name: 'Signup', value_mode: 'fixed', fixed_value: '49.5', not_an_input: 'x', pattern: '',
    });
    expect(goal.id).toBe('goal_1');
  });

  it('parses JSON inputs and turns dates into days', async () => {
    nock(API)
      .post('/workspaces/ws_1/exports.json', {
        site_id: 'pa_1', kind: 'aggregated', from: '2026-10-01', to: '2026-10-19', dimensions: ['country', 'device'], filters: [['country', 'is', 'US']],
      })
      .reply(201, { data: { id: 'exp_1', status: 'queued' } });
    nock(API).get('/workspaces.json').reply(200, WORKSPACES);
    const result = await create('create_export', {
      site_id: 'pa_1', kind: 'aggregated', from: '2026-10-01T09:00:00-04:00', to: '2026-10-19', dimensions: 'country, device', filters: '[["country","is","US"]]',
    });
    expect(result.status).toBe('queued');
  });

  it('rejects JSON that does not parse before calling the API', async () => {
    nock(API).get('/workspaces.json').reply(200, WORKSPACES);
    await expect(create('create_export', { site_id: 'pa_1', from: '2026-10-01', to: '2026-10-02', filters: '[[oops' })).rejects.toThrow(/filters must be valid JSON/);
  });

  it('sends lists in the query string the way Rails reads arrays', async () => {
    nock(API)
      .get('/sites/pa_1/testimonials.json')
      .query((query) => {
        // The URL carries status%5B%5D=approved&rating%5B%5D=4&rating%5B%5D=5.
        expect(query).toEqual({ 'status[]': 'approved', 'rating[]': ['4', '5'], sort: 'received_desc', per_page: '25' });
        return true;
      })
      .reply(200, { data: [{ id: 'tm_1' }] });
    const found = await search('find_testimonial', { site_id: 'pa_1', status: 'approved', min_rating: '4' });
    expect(found.map((t) => t.id)).toEqual(['tm_1']);
  });

  it('keeps the colon of a custom property breakdown and builds a summary', async () => {
    nock(API)
      .get('/sites/pa_1/breakdown/prop:plan.json')
      .query({ period: '30d', limit: '3' })
      .reply(200, {
        data: { period: { from: 'a', to: 'b' }, label: 'Property: plan', rows: [{ value: 'pro', completions: 12 }, { value: 'free', completions: 4 }] },
      });
    const [result] = await search('get_top_values', { site_id: 'pa_1', dimension: 'prop:plan', period: '30d', limit: '3' });
    expect(result.top_value).toBe('pro');
    expect(result.summary).toBe('1. pro: 12\n2. free: 4');
  });

  it('flattens stats with friendly units and the comparison', async () => {
    nock(API)
      .get('/sites/pa_1/stats/aggregate.json')
      .query({ period: '7d', compare: 'previous_period' })
      .reply(200, {
        data: {
          period: { from: 'f', to: 't' },
          metrics: { visitors: 10, visit_duration: 61500, revenue: 4950 },
          comparison_period: { from: 'pf', to: 'pt' },
          comparison: { visitors: 8 },
          change: { visitors: 25 },
        },
      });
    const [stats] = await search('get_site_stats', { site_id: 'pa_1', period: '7d', compare: 'previous_period' });
    expect(stats).toMatchObject({ visitors: 10, visit_duration_seconds: 62, revenue_amount: 49.5, previous_visitors: 8, change_visitors: 25 });
  });

  it('finds a site by any of its domains, never by a partial match', async () => {
    nock(API)
      .get('/workspaces/ws_1/sites.json')
      .query({ query: 'example.com', per_page: '100' })
      .reply(200, { data: [{ id: 'pa_1', domain: 'shop.example.com', extra_domains: [] }, { id: 'pa_2', domain: 'example.org', extra_domains: ['example.com'] }] });
    nock(API).get('/workspaces.json').reply(200, WORKSPACES);
    const found = await search('find_site', { domain: 'https://www.Example.com/pricing' });
    expect(found.map((s) => s.id)).toEqual(['pa_2']);
  });

  it('runs the chosen moderation action', async () => {
    nock(API).post('/sites/pa_1/testimonials/tm_1/pin.json', { pinned: false }).reply(200, { data: { id: 'tm_1', pinned: false } });
    nock(API).post('/sites/pa_1/testimonials/tm_1/reject.json').reply(200, { data: { id: 'tm_1', status: 'rejected' } });
    expect((await create('moderate_testimonial', { site_id: 'pa_1', id: 'tm_1', action: 'unpin' })).pinned).toBe(false);
    expect((await create('moderate_testimonial', { site_id: 'pa_1', id: 'tm_1', action: 'reject' })).status).toBe('rejected');
  });

  it('adds one recipient to a testimonial request', async () => {
    nock(API)
      .post('/sites/pa_1/testimonials/requests/req_1/recipients.json', {
        recipients: [{ email: 'jane@example.com', name: 'Jane Cooper', properties: { plan: 'Team' } }],
      })
      .reply(201, { data: { added: 1, skipped: 0, skipped_total: {} } });
    const result = await create('add_testimonial_request_recipient', {
      site_id: 'pa_1', request_id: 'req_1', email: 'jane@example.com', name: 'Jane Cooper', company: '', properties: { plan: 'Team' },
    });
    expect(result.added).toBe(1);
  });
});

describe('errors', () => {
  it('shows the API message with the fields it names', async () => {
    nock(API)
      .post('/sites/pa_1/goals.json')
      .reply(422, { error: { code: 'validation_failed', message: 'Name is missing', details: { name: ["can't be blank"] } } });
    await expect(create('create_goal', { site_id: 'pa_1', kind: 'page' })).rejects.toThrow(/Name is missing \(name: can't be blank\)/);
  });

  it('says when a plan is needed', async () => {
    nock(API).post('/sites/pa_1/campaigns/costs.json').reply(402, { error: { code: 'plan_limit', message: 'Campaign costs is part of the Business plan.' } });
    await expect(create('add_campaign_cost', { site_id: 'pa_1', campaign: 'x', month: '2026-10-05', amount: '10' })).rejects.toThrow(/higher Privatus Analytics plan/);
  });

  it('asks Zapier to retry later on 429', async () => {
    nock(API).get('/sites/pa_1/live.json').query(true).reply(429, { error: { code: 'rate_limited', message: 'Slow down' } });
    // zapier-platform-core turns a 429 into its ThrottledError before afterResponse.
    await expect(search('get_live_visitors', { site_id: 'pa_1' })).rejects.toThrow(/429/);
  });
});

describe('API request action', () => {
  it('calls a path on the API host and adds .json', async () => {
    nock(API).get('/sites/pa_1/goals.json').query({ status: 'all' }).reply(200, { data: [] });
    const result = await create('api_request', { method: 'GET', path: '/sites/pa_1/goals', query: { status: 'all' } });
    expect(result.status).toBe(200);
  });

  it('never sends the token to another host', async () => {
    for (const path of ['//evil.example.com/x', 'evil.example.com/x', '/a/../b', '/a b']) {
      await expect(create('api_request', { method: 'GET', path })).rejects.toThrow(/URL Path must be a path/);
    }
    // A full URL keeps only its path, so it still goes to the API host.
    nock(API).get('/workspaces.json').reply(200, WORKSPACES);
    await create('api_request', { method: 'GET', path: 'https://evil.example.com/workspaces' });
  });
});

describe('REST hooks', () => {
  it('subscribes one event to the target URL and keeps the secret', async () => {
    nock(API).get('/workspaces.json').reply(200, WORKSPACES);
    nock(API)
      .post('/workspaces/ws_1/webhooks.json', { url: 'https://hooks.zapier.com/x', events: ['uptime.down'], enabled: true })
      .reply(201, { data: { id: 'wh_1', secret: 'whsec_x' } });
    const data = await trigger('uptime_down', 'performSubscribe', { targetUrl: 'https://hooks.zapier.com/x', inputData: {} });
    expect(data).toEqual({ id: 'wh_1', secret: 'whsec_x', workspace_id: 'ws_1' });
  });

  it('unsubscribes, and an endpoint already gone is fine', async () => {
    nock(API).delete('/workspaces/ws_1/webhooks/wh_1.json').reply(404, { error: { code: 'not_found' } });
    const data = await trigger('uptime_down', 'performUnsubscribe', { subscribeData: { id: 'wh_1', workspace_id: 'ws_1' }, inputData: {} });
    expect(data).toEqual({ id: 'wh_1' });
  });

  it('falls back to the documented sample when there are no records', async () => {
    nock(API).get('/workspaces.json').reply(200, WORKSPACES);
    nock(API).get('/workspaces/ws_1/alerts.json').query(true).reply(200, { data: [] });
    const items = await trigger('alert_triggered', 'performList', { inputData: {} });
    expect(items[0]).toMatchObject({ id: 'whd_9K3M7QX2PL', event: 'alert.triggered' });
  });

  it('moves an id inside the data so the delivery id stays the item id', () => {
    const item = toItem({ id: 'whd_1', event: 'export.ready', created_at: 't', data: { id: 'exp_1', site_id: 'pa_1' } }, 'export_id');
    expect(item).toMatchObject({ id: 'whd_1', export_id: 'exp_1', occurred_at: 't' });
  });
});
