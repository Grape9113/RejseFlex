import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { proposeJourney, recordBookingTime, refreshTrainSuggestion, confirmBooking, confirmTrainChoice, confirmAssistance } from '../src/journey.js';
import { mountApp } from '../src/app.js';

const wish = { from: { label: 'Start' }, to: { label: 'Slut' }, arrival: '2026-10-02T14:00' };
const train = (id, arrival) => ({ id, fromStation: { id: 'a', name: 'A' }, toStation: { id: 'b', name: 'B' }, plannedDeparture: '2026-10-02T10:00:00Z', plannedArrival: arrival });
const source = { async findConnections() { return [train('late', '2026-10-02T12:30:00Z'), train('early', '2026-10-02T11:00:00Z')]; } };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('bekræftet Handicapservice forbliver knyttet til det oprindelige tog efter nyt togforslag', async () => {
  const plan = await proposeJourney(wish, { trainSource: source });
  const timed = await recordBookingTime(plan, 'inbound', '2026-10-02T13:00:00Z', { trainSource: source });
  const confirmed = confirmAssistance(confirmTrainChoice(confirmBooking(timed, 'inbound')));
  assert.equal(confirmed.tasks.find((task) => task.id === 'assistance').trainId, 'late');
  assert.deepEqual(confirmed.tasks.find((task) => task.id === 'assistance').stationIds, ['a', 'b']);
  const changedSource = { async findConnections() { return [train('early', '2026-10-02T11:00:00Z')]; } };
  const changed = await refreshTrainSuggestion(confirmed, { trainSource: changedSource });
  assert.equal(changed.legs[1].id, 'early');
  assert.equal(changed.tasks.find((task) => task.id === 'assistance').trainId, 'late');
  assert.equal(changed.tasks.find((task) => task.id === 'assistance').status, 'bestilt');
  assert.ok(changed.conflicts.some((conflict) => conflict.code === 'assistance-train-changed'));
  assert.match(changed.nextAction.explanation, /Handicapservice.*kontrollér/i);
  const restored = await refreshTrainSuggestion(changed, { trainSource: source });
  assert.equal(restored.legs[1].id, 'late');
  assert.equal(restored.feasibility, 'foreløbig');
  assert.deepEqual(restored.conflicts, []);
  assert.equal(restored.tasks.find((task) => task.id === 'assistance').trainId, 'late');
});

test('bruger kan bekræfte Handicapservice særskilt og genåbne den lokalt', async () => {
  const saved = new Map();
  const store = { list: async () => [...saved.values()], save: async (plan) => saved.set(plan.id, structuredClone(plan)) };
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  mountApp(root, { journeyStore: store, trainSource: source });
  const form = root.querySelector('form');
  form.elements.from.value = 'Start'; form.elements.to.value = 'Slut'; form.elements.date.value = '2026-10-02'; form.elements.time.value = '14:00';
  form.elements.handicapProvider.value = 'FYNBUS';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick(); root.querySelector('[data-select-plan]').click(); await tick();
  assert.match(root.querySelector('[data-assistance-task]').textContent, /frist.*ukendt.*mødetid.*ukendt/i);
  root.querySelector('[data-booking-time]').value = '2026-10-02T13:00';
  root.querySelector('[data-record-time]').click(); await tick();
  root.querySelector('[data-confirm-booking]').click(); await tick();
  root.querySelector('[data-confirm-train]').click(); await tick();
  root.querySelector('[data-confirm-assistance]').click(); await tick();
  assert.equal([...saved.values()][0].tasks.find((task) => task.id === 'assistance').status, 'bestilt');
  root.querySelector('[data-open-plan]').click();
  assert.match(root.querySelector('[data-assistance-task]').textContent, /bekræftet ekstern/i);
});

test('samme tog-id med ændret afgang giver konflikt og bevarer bekræftede detaljer', async () => {
  const plan = await proposeJourney(wish, { trainSource: source });
  const timed = await recordBookingTime(plan, 'inbound', '2026-10-02T13:00:00Z', { trainSource: source });
  const confirmed = confirmAssistance(confirmTrainChoice(confirmBooking(timed, 'inbound')));
  const changedTrain = { ...train('late', '2026-10-02T12:30:00Z'), plannedDeparture: '2026-10-02T10:30:00Z' };
  const changed = await refreshTrainSuggestion(confirmed, { trainSource: { async findConnections() { return [changedTrain]; } } });
  assert.equal(changed.tasks.find((task) => task.id === 'assistance').trainIdentity.plannedDeparture, '2026-10-02T10:00:00Z');
  assert.equal(changed.legs[1].plannedDeparture, '2026-10-02T10:30:00Z');
  assert.ok(changed.conflicts.some((conflict) => conflict.code === 'assistance-train-changed'));
});

test('Handicapservice kan ikke bekræftes før togforslaget er kontrolleret', async () => {
  const plan = await proposeJourney(wish, { trainSource: source });
  assert.throws(() => confirmAssistance(plan), /Kontrollér togforslaget/);
  const timed = await recordBookingTime(plan, 'inbound', '2026-10-02T13:00:00Z', { trainSource: source });
  assert.throws(() => confirmAssistance(confirmBooking(timed, 'inbound')), /Kontrollér togforslaget/);
});


test('første handicapkørsel kan ikke registreres før afhængighederne er afsluttet', async () => {
  const plan = await proposeJourney(wish, { trainSource: source });
  await assert.rejects(recordBookingTime(plan, 'outbound', '2026-10-02T09:00:00Z'), /tidligere trin/);
  assert.throws(() => confirmAssistance(plan), /Kontrollér togforslaget/);
});
