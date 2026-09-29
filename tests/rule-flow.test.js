import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeJourney } from '../src/journey.js';

const wish = {
  from: { label: 'Søndersø', coordinates: { latitude: 55.48, longitude: 10.25 } },
  to: { label: 'Dock 1', coordinates: { latitude: 56.15, longitude: 10.21 } },
  arrival: '2026-10-02T14:00',
};

test('unknown traffic area keeps the plan provisional and gives a targeted control action', async () => {
  const plan = await proposeJourney(wish);
  assert.equal(plan.feasibility, 'foreløbig');
  assert.equal(plan.origin, 'demo');
  assert.equal(plan.nextAction.taskId, 'inbound');
  assert.match(plan.nextAction.explanation, /trafikområde|trafikselskab/i);
  assert.equal(plan.legs[2].priceEstimate.kind, 'unknown');
  assert.ok(plan.uncertainties.some((item) => item.code === 'unknown-traffic-area' && item.taskId === 'inbound'));
  assert.ok(plan.uncertainties.some((item) => item.code === 'unknown-price' && item.taskId === 'inbound'));
  assert.ok(plan.appliedRules.some((item) => item.ruleId === 'demo-inbound-first' && item.source));
});

test('an expired necessary rule creates a control action instead of a booking instruction', async () => {
  const plan = await proposeJourney(wish, {
    trafficAreaSource: { classify: async () => ({ kind: 'known', areaId: 'demo-area', operator: 'Demooperatør' }) },
    rules: [{ id: 'demo-inbound-first', type: 'calculation', appliesTo: 'booking-order', geographicScope: 'all',
      source: 'Demo, ikke transportfakta', lastVerified: '2026-01-01', validFrom: '2026-01-01', validUntil: '2026-09-01',
      effect: { firstTaskId: 'inbound' }, explanation: 'Demo-rækkefølge.' }],
  });
  assert.equal(plan.feasibility, 'foreløbig');
  assert.ok(plan.uncertainties.some((item) => item.code === 'expired-required-rule'));
  assert.match(plan.nextAction.title, /kontrollér|afklar/i);
});
