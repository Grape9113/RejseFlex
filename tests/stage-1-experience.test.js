import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountApp } from '../src/app.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const places = {
  Start: { id: 'start', label: 'Startadresse', coordinates: { latitude: 55.5, longitude: 10.3 } },
  Slut: { id: 'end', label: 'Destinationsadresse', coordinates: { latitude: 56.1, longitude: 10.2 } },
};
const train = (id, arrival) => ({ id, fromStation: { id: 'a', name: 'A' }, toStation: { id: 'b', name: 'B' }, plannedDeparture: '2026-10-02T10:00:00Z', plannedArrival: arrival });
const pickup = new Date('2026-10-02T13:00').getTime();
const trains = [train('later', new Date(pickup + 30 * 60_000).toISOString()), train('earlier', new Date(pickup - 30 * 60_000).toISOString())];
const source = { async findConnections() { return trains; } };
const saved = new Map();
const store = { list: async () => [...saved.values()], save: async (plan) => saved.set(plan.id, structuredClone(plan)) };
function openApp() {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  mountApp(root, { journeyStore: store, trainSource: source, geocoder: { search: async (query) => [places[query]] }, map: { show() {} } });
  return { dom, root };
}

test('mobilbruger søger, vælger, registrerer tid, genberegner og genåbner den foreløbige demorejse', async () => {
  saved.clear();
  const { dom, root } = openApp();
  const form = root.querySelector('form');
  for (const field of ['from', 'to']) {
    form.elements[field].value = field === 'from' ? 'Start' : 'Slut';
    root.querySelector(`[data-search="${field}"]`).click(); await tick();
    root.querySelector(`[data-place-option="${field}"]`).click();
  }
  form.elements.arrival.value = '2026-10-02T14:00';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.match(root.querySelector('#result').textContent, /DEMOREJSE.*Foreløbig rejseplan.*NÆSTE HANDLING/s);
  assert.equal(root.querySelectorAll('[data-journey-section]').length, 4);
  assert.equal(saved.size, 0);
  root.querySelector('[data-select-plan]').click(); await tick();
  root.querySelector('[data-booking-time]').value = '2026-10-02T13:00';
  root.querySelector('[data-record-time]').click(); await tick();
  assert.equal([...saved.values()][0].legs[1].id, 'earlier');
  assert.match(root.querySelector('[data-next-action]').textContent, /Bekræft den eksterne bestilling/);
  root.querySelector('[data-confirm-booking]').click(); await tick();
  root.querySelector('[data-confirm-train]').click(); await tick();
  root.querySelector('[data-confirm-assistance]').click(); await tick();
  assert.match(root.querySelector('[data-next-action]').textContent, /første handicapkørsel/i);
  const reopened = openApp(); await tick();
  reopened.root.querySelector('[data-open-plan]').click();
  assert.match(reopened.root.querySelector('#result').textContent, /Bekræftet ekstern bestilling/);
  assert.match(reopened.root.querySelector('[data-assistance-task]').textContent, /Bekræftet ekstern Handicapservice-bestilling/);
  assert.match(reopened.root.querySelector('#result').textContent, /Foreløbig rejseplan/);
});

test('alle fire demotrin kan registreres i rækkefølge', async () => {
  saved.clear();
  const { root, dom } = openApp();
  const form = root.querySelector('form');
  for (const field of ['from', 'to']) {
    form.elements[field].value = field === 'from' ? 'Start' : 'Slut';
    root.querySelector(`[data-search="${field}"]`).click(); await tick();
    root.querySelector(`[data-place-option="${field}"]`).click();
  }
  form.elements.arrival.value = '2026-10-02T14:00';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await tick();
  root.querySelector('[data-select-plan]').click(); await tick();
  assert.equal(root.querySelector('[data-booking-time-outbound]'), null);
  assert.equal(root.querySelector('[data-confirm-assistance]'), null);
  root.querySelector('[data-booking-time]').value = '2026-10-02T13:00';
  root.querySelector('[data-record-time]').click(); await tick();
  root.querySelector('[data-confirm-booking]').click(); await tick();
  root.querySelector('[data-confirm-train]').click(); await tick();
  root.querySelector('[data-confirm-assistance]').click(); await tick();
  root.querySelector('[data-booking-time-outbound]').value = '2026-10-02T09:00';
  root.querySelector('[data-record-time-outbound]').click(); await tick();
  root.querySelector('[data-confirm-booking-outbound]').click(); await tick();
  const plan = [...saved.values()][0];
  assert.deepEqual(plan.tasks.map((task) => task.status), ['bestilt', 'færdig', 'bestilt', 'bestilt']);
  assert.match(root.querySelector('[data-next-action]').textContent, /Bookingforløbet er registreret/);
});
