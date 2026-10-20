'use strict';

const { compact, run } = require('../lib/api');
const { inputFields, SITE, dropdown } = require('../lib/fields');
const { makeCreate } = require('../lib/actions');

const TAGS_HELP = 'Tag names or IDs. A name that does not exist yet is created.';

const createTestimonial = makeCreate({
  key: 'create_testimonial',
  noun: 'Testimonial',
  label: 'Create Testimonial',
  description:
    "Adds a text testimonial, for example from a review, a support chat or a survey reply. It counts toward the plan's monthly testimonials.",
  operationId: 'testimonials_create',
  sampleKey: 'testimonial',
  fields: [
    SITE,
    ...inputFields('testimonials_create', {
      only: [
        'body',
        'person_name',
        'person_email',
        'person_title',
        'person_company',
        'person_company_url',
        'person_social_url',
        'rating',
        'title',
        'highlight',
        'received_at',
        'source_name',
        'source_url',
        'language',
        'status',
        'tags',
        'collection_ids',
        'properties',
        'pinned',
        'external_id',
        'allow_duplicate',
      ],
      override: {
        body: { required: true, type: 'text', helpText: 'The words, up to 10,000 characters.' },
        person_name: { required: true, helpText: 'Who gave it.' },
        rating: { choices: ['1', '2', '3', '4', '5'], helpText: '1 to 5 stars. Leave empty for no rating.' },
        received_at: { type: 'datetime' },
        tags: { helpText: TAGS_HELP },
        collection_ids: { dynamic: 'testimonial_collection_list.id.name', label: 'Collections', helpText: 'Manual collections to add it to.' },
        properties: { type: undefined, dict: true, helpText: 'Custom property values by key, as set up in the site\'s testimonial settings.' },
        external_id: {
          label: 'External ID',
          helpText: 'Your own ID for it, such as the review or ticket ID. Sending the same one again returns the testimonial already stored instead of a copy.',
        },
      },
    }),
  ],
  prepare: async (z, bundle) => ({ ...bundle.inputData, kind: 'text' }),
});

const TESTIMONIAL = {
  key: 'id',
  label: 'Testimonial',
  required: true,
  dynamic: 'testimonial_list.id.name',
  helpText: 'The testimonial (tm_...). Usually mapped from a trigger or a Find Testimonial step. The list shows the newest ones.',
};

const updateTestimonial = makeCreate({
  key: 'update_testimonial',
  noun: 'Testimonial',
  label: 'Update Testimonial',
  description: 'Changes a testimonial: its words, rating, tags, custom properties and more. Only the fields filled in are changed.',
  operationId: 'testimonials_update',
  sampleKey: 'testimonial',
  fields: [
    SITE,
    TESTIMONIAL,
    ...inputFields('testimonials_update', {
      omit: ['site_id', 'id', 'person_id'],
      override: {
        body: { type: 'text' },
        rating: { choices: ['1', '2', '3', '4', '5'] },
        received_at: { type: 'datetime' },
        properties: { type: undefined, dict: true },
        add_tags: { dynamic: 'testimonial_tag_list.name.name', helpText: TAGS_HELP },
        remove_tags: { dynamic: 'testimonial_tag_list.name.name' },
      },
    }),
  ],
});

const MODERATION = {
  approve: ['testimonials_approve', {}],
  reject: ['testimonials_reject', {}],
  pend: ['testimonials_pend', {}],
  pin: ['testimonials_pin', { pinned: true }],
  unpin: ['testimonials_pin', { pinned: false }],
};

const moderateTestimonial = makeCreate({
  key: 'moderate_testimonial',
  noun: 'Testimonial',
  label: 'Approve, Reject or Pin Testimonial',
  description: 'Approves or rejects a testimonial, returns it to pending, or pins it so it is shown first.',
  operationId: 'testimonials_approve',
  sampleKey: 'testimonial',
  fields: [
    SITE,
    TESTIMONIAL,
    {
      key: 'action',
      label: 'Action',
      required: true,
      choices: { approve: 'Approve', reject: 'Reject', pend: 'Return to pending', pin: 'Pin', unpin: 'Unpin' },
    },
  ],
});
moderateTestimonial.operation.perform = async (z, bundle) => {
  const choice = MODERATION[bundle.inputData.action];
  if (!choice) throw new z.errors.Error('Action must be approve, reject, pend, pin or unpin.', 'InvalidInput', 400);
  const [operation, extra] = choice;
  return run(z, bundle, operation, { site_id: bundle.inputData.site_id, id: bundle.inputData.id, ...extra });
};

const createPerson = makeCreate({
  key: 'create_testimonial_person',
  noun: 'Person',
  label: 'Create Testimonial Person',
  description: 'Adds a person (a customer who gives testimonials) to a site.',
  operationId: 'testimonial_people_create',
  sampleKey: 'person',
  fields: [SITE, ...inputFields('testimonial_people_create', { omit: ['site_id', 'avatar_media_id'], override: { name: { required: true } } })],
});

const addRecipient = makeCreate({
  key: 'add_testimonial_request_recipient',
  noun: 'Recipient',
  label: 'Ask for a Testimonial',
  description:
    'Adds a person to a testimonial request. In a running request they get the first email at once, in a draft they wait for it to be sent. Request emails need the Business plan and a connected email provider.',
  operationId: 'testimonial_request_recipients_create',
  sampleKey: 'recipients',
  outputFields: [
    { key: 'added', label: 'Added', type: 'number' },
    { key: 'skipped', label: 'Skipped', type: 'number' },
  ],
  fields: [
    SITE,
    dropdown('request_id', 'testimonial_request_list.id.name', 'Request', { required: true }),
    { key: 'email', label: 'Email', required: true, helpText: 'The address the request email goes to.' },
    { key: 'name', label: 'Name', helpText: 'Used in the email greeting and to fill in the form.' },
    { key: 'company', label: 'Company' },
    { key: 'title', label: 'Job Title' },
    { key: 'properties', label: 'Properties', dict: true, helpText: "Custom property values for the testimonial, by key, as set up in the site's testimonial settings." },
  ],
  prepare: async (z, bundle) => {
    const { site_id: siteId, request_id: requestId, email, name, company, title, properties } = bundle.inputData;
    const recipient = compact({ email, name, company, title });
    if (properties && Object.keys(properties).length) recipient.properties = properties;
    return { site_id: siteId, request_id: requestId, recipients: [recipient] };
  },
});

module.exports = [createTestimonial, updateTestimonial, moderateTestimonial, createPerson, addRecipient];
