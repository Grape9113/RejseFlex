import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeJourney, recordBookingTime, confirmBooking } from '../src/journey.js';

const wish = { from: { label: 'Søndersø', coordinates: null }, to: { label: 'Dock 1', coordinates: null }, arrival: '2026-10-02T14:00' };
const train = (id, arrival) => ({ id, fromStation: { id: 'a', name: 'A' }, toStation: { id: 'b', name: 'B' }, plannedDeparture: '2026-10-02T10:00:00Z', plannedArrival: arrival, disruption: { kind: 'unknown' } });
const source = { async findConnections() { return [train('late', '2026-10-02T12:30:00Z'), train('early', '2026-10-02T11:00:00Z')]; } };

test('recorded inbound pickup is distinct from confirmation and changes the open train suggestion', async () => {
  const plan = await proposeJourney(wish, { trainSource: source });
  const updated = await recordBookingTime(plan, 'inbound', '2026-10-02T12:00:00Z', { trainSource: source });
  assert.equal(updated.tasks.find((task) => task.id === 'inbound').status, 'afventer brugerinput');
  assert.equal(updated.legs[2].actualBookingTime, '2026-10-02T12:00:00Z');
  assert.equal(updated.legs[1].id, 'early');
  assert.equal(updated.nextAction.taskId, 'inbound');
  assert.match(updated.nextAction.explanation, /bekræft/i);
  assert.ok(updated.uncertainties.some((item) => item.code === 'unknown-transfer-buffer'));
});

test('confirmed booking stays fixed and impossible train connection creates actionable conflict', async () => {
  const plan = await proposeJourney(wish, { trainSource: source });
  const timed = await recordBookingTime(plan, 'inbound', '2026-10-02T10:30:00Z', { trainSource: source });
  const confirmed = confirmBooking(timed, 'inbound');
  assert.equal(confirmed.legs[2].actualBookingTime, '2026-10-02T10:30:00Z');
  assert.equal(confirmed.tasks.find((task) => task.id === 'inbound').status, 'bestilt');
  assert.equal(confirmed.feasibility, 'konflikt');
  assert.deepEqual(confirmed.conflicts[0].taskIds, ['train', 'inbound']);
  assert.match(confirmed.nextAction.explanation, /kontakt|ændr/i);
});

import { JSDOM } from 'jsdom';
import { mountApp } from '../src/app.js';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test('selected journey accepts time and separate confirmation, then persists updates', async () => {
  const saved = new Map();
  const store = { list: async () => [...saved.values()], save: async (plan) => saved.set(plan.id, structuredClone(plan)) };
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  mountApp(root, { journeyStore: store, trainSource: source });
  const form = root.querySelector('form');
  form.elements.from.value = 'Søndersø'; form.elements.to.value = 'Dock 1'; form.elements.arrival.value = '2026-10-02T14:00';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick(); root.querySelector('[data-select-plan]').click(); await tick();
  assert.ok(root.querySelector('[data-booking-time]'));
  root.querySelector('[data-booking-time]').value = '2026-10-02T12:00';
  root.querySelector('[data-record-time]').click(); await tick();
  assert.match(root.querySelector('[data-next-action]').textContent, /bekræft/i);
  assert.equal([...saved.values()][0].tasks.find((task) => task.id === 'inbound').status, 'afventer brugerinput');
  root.querySelector('[data-confirm-booking]').click(); await tick();
  assert.equal([...saved.values()][0].tasks.find((task) => task.id === 'inbound').status, 'bestilt');
});
