'use strict';

const { call, enc } = require('../lib/api');
const samples = require('../samples');
const { makeHookTrigger } = require('./hook');

module.exports = makeHookTrigger({
  key: 'goal_completed',
  noun: 'Goal Completion',
  label: 'Goal Completed',
  description: 'Triggers when a visitor completes a goal (signup, purchase, download…) on one of your sites.',
  event: 'goal.completed',
  sample: samples.goalCompleted,
  extraFields: [
    {
      key: 'site_id',
      label: 'Site',
      required: false,
      dynamic: 'site_list.id.name',
      altersDynamicFields: true,
      helpText: 'Only trigger for this site. Leave empty for every site in the workspace.',
    },
    {
      key: 'goal_id',
      label: 'Goal',
      required: false,
      dynamic: 'goal_list.id.name',
      helpText: 'Only trigger for this goal (pick a site first). Leave empty for every goal.',
    },
  ],
  matches: (item, input) =>
    (!input.site_id || item.site_id === input.site_id) && (!input.goal_id || item.goal_id === input.goal_id),
  // No "recent completions" endpoint: build a realistic sample from a real
  // goal of the chosen site when possible, else the static sample.
  performListSample: async (z, bundle) => {
    const { site_id: siteId, goal_id: goalId } = bundle.inputData || {};
    if (!siteId) return { ...samples.goalCompleted, workspace_id: bundle.inputData.workspace_id || samples.goalCompleted.workspace_id };
    try {
      const [site, goals] = await Promise.all([
        call(z, bundle, 'GET', `/sites/${enc(siteId)}.json`),
        call(z, bundle, 'GET', `/sites/${enc(siteId)}/goals.json`, { params: { per_page: 100 } }),
      ]);
      const goal = (goals || []).find((g) => !goalId || g.id === goalId) || samples.goal;
      return {
        ...samples.goalCompleted,
        workspace_id: site.workspace_id,
        site_id: site.id,
        site_domain: site.domain,
        site_name: site.name,
        goal_id: goal.id,
        goal_name: goal.name,
        goal_kind: goal.kind,
        event_name: goal.event_name || null,
        currency: site.currency || samples.goalCompleted.currency,
      };
    } catch (e) {
      return samples.goalCompleted;
    }
  },
});
