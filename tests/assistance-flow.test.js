import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { proposeJourney, recordBookingTime, confirmAssistance } from '../src/journey.js';
import { mountApp } from '../src/app.js';

const wish = { from: { label: 'Start' }, to: { label: 'Slut' }, arrival: '2026-10-02T14:00' };
const train = (id, arrival) => ({ id, fromStation: { id: 'a', name: 'A' }, toStation: { id: 'b', name: 'B' }, plannedDeparture: '2026-10-02T10:00:00Z', plannedArrival: arrival });
const source = { async findConnections() { return [train('late', '2026-10-02T12:30:00Z'), train('early', '2026-10-02T11:00:00Z')]; } };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('bekræftet Handicapservice forbliver knyttet til det oprindelige tog efter nyt togforslag', async () => {
  const plan = await proposeJourney(wish, { trainSource: source });
  const confirmed = confirmAssistance(plan);
  assert.equal(confirmed.tasks.find((task) => task.id === 'assistance').trainId, 'late');
  assert.deepEqual(confirmed.tasks.find((task) => task.id === 'assistance').stationIds, ['a', 'b']);
  const changed = await recordBookingTime(confirmed, 'inbound', '2026-10-02T12:00:00Z', { trainSource: source });
  assert.equal(changed.legs[1].id, 'early');
  assert.equal(changed.tasks.find((task) => task.id === 'assistance').trainId, 'late');
  assert.equal(changed.tasks.find((task) => task.id === 'assistance').status, 'bestilt');
  assert.ok(changed.conflicts.some((conflict) => conflict.code === 'assistance-train-changed'));
  assert.match(changed.nextAction.explanation, /Handicapservice.*kontrollér/i);
});

test('bruger kan bekræfte Handicapservice særskilt og genåbne den lokalt', async () => {
  const saved = new Map();
  const store = { list: async () => [...saved.values()], save: async (plan) => saved.set(plan.id, structuredClone(plan)) };
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  mountApp(root, { journeyStore: store, trainSource: source });
  const form = root.querySelector('form');
  form.elements.from.value = 'Start'; form.elements.to.value = 'Slut'; form.elements.arrival.value = '2026-10-02T14:00';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick(); root.querySelector('[data-select-plan]').click(); await tick();
  assert.match(root.querySelector('[data-assistance-task]').textContent, /frist.*ukendt.*mødetid.*ukendt/i);
  root.querySelector('[data-confirm-assistance]').click(); await tick();
  assert.equal([...saved.values()][0].tasks.find((task) => task.id === 'assistance').status, 'bestilt');
  root.querySelector('[data-open-plan]').click();
  assert.match(root.querySelector('[data-assistance-task]').textContent, /bekræftet ekstern/i);
});
