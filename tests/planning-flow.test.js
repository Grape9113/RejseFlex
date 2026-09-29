import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountApp } from '../src/app.js';

test('selected journey wish yields a demo chain and explained next action', async () => {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  const from = { id: 'from', label: 'Søndersø', coordinates: { latitude: 55.48, longitude: 10.25 } };
  const to = { id: 'to', label: 'Dock 1, Aarhus', coordinates: { latitude: 56.15, longitude: 10.21 } };
  const train = {
    id: 'demo-train-1',
    fromStation: { id: 'odense', name: 'Odense St.' },
    toStation: { id: 'aarhus', name: 'Aarhus H' },
    plannedDeparture: '2026-10-02T11:00:00+02:00',
    plannedArrival: '2026-10-02T12:30:00+02:00',
    disruption: { kind: 'unknown' },
  };
  const queries = [];
  mountApp(root, {
    geocoder: { search: async (query) => query === 'Søndersø' ? [from] : [to] },
    trainSource: { findConnections: async (wish) => { queries.push(wish); return [train]; } },
  });
  const form = root.querySelector('form');
  form.elements.from.value = from.label;
  form.elements.to.value = to.label;
  for (const field of ['from', 'to']) {
    root.querySelector(`[data-search="${field}"]`).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.querySelector(`[data-place-option="${field}"]`).click();
  }
  form.elements.arrival.value = '2026-10-02T14:00';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].from, from);
  assert.deepEqual(queries[0].to, to);
  assert.equal(queries[0].arrival, '2026-10-02T14:00');
  assert.equal(root.querySelectorAll('[data-journey-section]').length, 4);
  assert.match(root.querySelector('#result').textContent, /Odense St\./);
  assert.match(root.querySelector('#result').textContent, /Aarhus H/);
  assert.match(root.querySelector('#result').textContent, /12[.:]30/);
  assert.match(root.querySelector('[data-next-action]').textContent, /sidste handicapkørsel/i);
  assert.match(root.querySelector('[data-next-action]').textContent, /toget afhænger/i);
  assert.match(root.querySelector('#result').textContent, /DEMO/);
  assert.ok(root.querySelector('[data-select-plan]'));
  root.querySelector('[data-select-plan]').click();
  assert.match(root.querySelector('[data-next-action]').textContent, /sidste handicapkørsel/i);
});
