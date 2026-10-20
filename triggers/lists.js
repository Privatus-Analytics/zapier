'use strict';

const { run } = require('../lib/api');

// Hidden triggers behind the dynamic dropdowns. Each one lists a page of
// 100 records (Zapier asks for the next page with "Load more").

const page = (bundle) => ((bundle.meta && bundle.meta.page) || 0) + 1;

const siteLabel = (site) => (site.name && site.name !== site.domain ? `${site.name} (${site.domain})` : site.domain);

const makeList = ({ key, noun, operationId, needsSite = false, params = {}, name, sample }) => ({
  key,
  noun,
  display: { label: `List ${noun}s`, description: `Lists ${noun.toLowerCase()}s for dropdowns.`, hidden: true },
  operation: {
    canPaginate: true,
    perform: async (z, bundle) => {
      const siteId = bundle.inputData && bundle.inputData.site_id;
      if (needsSite && !siteId) return [];
      const records = (await run(z, bundle, operationId, { ...params, site_id: siteId, page: page(bundle), per_page: 100 })) || [];
      return records.map((record) => ({ ...record, name: name(record) }));
    },
    sample: { id: sample.id, name: sample.name },
    outputFields: [
      { key: 'id', label: `${noun} ID` },
      { key: 'name', label: 'Name' },
    ],
  },
});

const LISTS = [
  makeList({ key: 'site_list', noun: 'Site', operationId: 'sites_list', name: siteLabel, sample: { id: 'pa_7Q2K9XH3AB', name: 'Example (example.com)' } }),
  makeList({ key: 'goal_list', noun: 'Goal', operationId: 'goals_list', needsSite: true, params: { status: 'active' }, name: (g) => g.name, sample: { id: 'goal_7Q2K9XH3AB', name: 'Signup' } }),
  makeList({ key: 'segment_list', noun: 'Segment', operationId: 'segments_list', needsSite: true, name: (s) => s.name, sample: { id: 'seg_7Q2K9XH3AB', name: 'Paid search visitors' } }),
  makeList({
    key: 'alert_list',
    noun: 'Alert Rule',
    operationId: 'alerts_list',
    name: (a) => a.name,
    sample: { id: 'alr_7Q2K9XH3AB', name: 'Traffic drop on example.com' },
  }),
  makeList({
    key: 'uptime_check_list',
    noun: 'Uptime Check',
    operationId: 'uptime_checks_list',
    needsSite: true,
    name: (c) => `${c.name} (${c.status})`,
    sample: { id: 'upc_4M8X2TQ7LB', name: 'example.com homepage (up)' },
  }),
  makeList({
    key: 'status_page_list',
    noun: 'Status Page',
    operationId: 'status_pages_list',
    name: (p) => p.name,
    sample: { id: 'sp_7Q2K9XH3AB', name: 'Example status' },
  }),
  makeList({
    key: 'experiment_list',
    noun: 'Experiment',
    operationId: 'experiments_list',
    needsSite: true,
    params: { status: 'all' },
    name: (e) => `${e.name} (${e.status})`,
    sample: { id: 'exp_7Q2K9XH3AB', name: 'Pricing page headline (running)' },
  }),
  makeList({
    key: 'testimonial_form_list',
    noun: 'Testimonial Form',
    operationId: 'testimonial_forms_list',
    needsSite: true,
    name: (f) => f.name,
    sample: { id: 'frm_3C8V5ZP2RN', name: 'Customer feedback' },
  }),
  makeList({
    key: 'testimonial_request_list',
    noun: 'Testimonial Request',
    operationId: 'testimonial_requests_list',
    needsSite: true,
    name: (r) => `${r.name} (${r.status})`,
    sample: { id: 'req_6H2N9WK4TD', name: 'New customers (waiting)' },
  }),
  makeList({
    key: 'testimonial_list',
    noun: 'Testimonial',
    operationId: 'testimonials_list',
    needsSite: true,
    params: { sort: 'added_desc' },
    name: (t) => {
      const who = (t.person && t.person.name) || 'Unknown';
      const words = String(t.body || t.title || '').replace(/\s+/g, ' ').trim();
      return `${who}: ${words.length > 60 ? `${words.slice(0, 57)}...` : words} (${t.status})`;
    },
    sample: { id: 'tm_4TXN8R2KQ7', name: 'Jane Cooper: Privatus Analytics replaced three tools for us. (approved)' },
  }),
  makeList({
    key: 'testimonial_tag_list',
    noun: 'Testimonial Tag',
    operationId: 'testimonial_tags_list',
    needsSite: true,
    name: (t) => t.name,
    sample: { id: 'tag_8P3R6LM2QX', name: 'Onboarding' },
  }),
  makeList({
    key: 'testimonial_collection_list',
    noun: 'Testimonial Collection',
    operationId: 'testimonial_collections_list',
    needsSite: true,
    name: (c) => c.name,
    sample: { id: 'col_2W7K4NB9VR', name: 'Homepage' },
  }),
];

module.exports = { LISTS, siteLabel };
