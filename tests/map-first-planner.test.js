import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountApp } from '../src/app.js';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const place = (label, latitude) => ({ id: label, label, coordinates: { latitude, longitude: 10.2 } });
function setup(search = async () => []) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  const shown = [];
  const wishes = [];
  mountApp(root, { geocoder: { search }, map: { show: (points) => shown.push(points) },
    trainSource: { findConnections: async (wish) => { wishes.push(wish); return [{ id: 'demo', fromStation: { id: 'a', name: 'A' }, toStation: { id: 'b', name: 'B' }, plannedDeparture: '2026-10-02T10:00:00Z', plannedArrival: '2026-10-02T11:00:00Z' }]; } } });
  return { dom, root, shown, wishes };
}
function type(dom, input, value) { input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }

test('first screen is a map planner with native date/time and no marketing sections or address button', () => {
  const { root } = setup();
  assert.ok(root.querySelector('#address-map.planner-map'));
  assert.ok(root.querySelector('.planner-panel form'));
  assert.equal(root.querySelector('[name="date"]').type, 'date');
  assert.equal(root.querySelector('[name="time"]').type, 'time');
  assert.equal(root.querySelectorAll('[name="timeMode"]').length, 2);
  assert.equal(root.querySelector('[name="timeMode"]:checked').value, 'arrival');
  assert.equal(root.querySelector('[data-search]'), null);
  assert.equal(root.querySelector('.hero'), null);
});

test('typing opens suggestions; keyboard selection stores coordinates and plans chosen departure date/time', async () => {
  const from = place('Egmont Højskolen, Villavej 25, 8300 Odder', 55.9);
  const to = place('Dokk1, Hack Kampmanns Plads 2, 8000 Aarhus C', 56.15);
  const calls = [];
  const { dom, root, shown, wishes } = setup(async (query) => { calls.push(query); return query === 'Egmont' ? [from] : [to]; });
  const form = root.querySelector('form');
  type(dom, form.elements.from, 'Egmont');
  await tick(350);
  assert.deepEqual(calls, ['Egmont']);
  assert.equal(root.querySelectorAll('[data-place-option="from"]').length, 1);
  form.elements.from.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  form.elements.from.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(form.elements.from.value, from.label);
  assert.deepEqual(shown.at(-1), [from]);
  type(dom, form.elements.to, 'Dokk1');
  await tick(350);
  root.querySelector('[data-place-option="to"]').click();
  assert.deepEqual(shown.at(-1), [from, to]);
  form.elements.date.value = '2026-10-02';
  form.elements.time.value = '09:30';
  root.querySelector('[name="timeMode"][value="departure"]').checked = true;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.deepEqual(wishes[0].from.coordinates, from.coordinates);
  assert.deepEqual(wishes[0].to.coordinates, to.coordinates);
  assert.equal(wishes[0].timeMode, 'departure');
  assert.equal(wishes[0].departure, '2026-10-02T09:30');
  assert.equal(root.querySelector('.planner-screen').hidden, true);
  assert.match(root.querySelector('#result').textContent, /Ønsket afgang/);
  root.querySelector('[data-back-to-planner]').click();
  assert.equal(root.querySelector('.planner-screen').hidden, false);
  assert.equal(form.elements.from.value, from.label);
});

test('Escape closes suggestions, changed text clears selection, and lookup errors stay inline', async () => {
  let fail = false;
  const { dom, root } = setup(async () => { if (fail) throw new Error('offline'); return [place('Odder', 55.97)]; });
  const input = root.querySelector('[name="from"]');
  type(dom, input, 'Odd'); await tick(350);
  assert.equal(root.querySelectorAll('[data-place-option="from"]').length, 1);
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(root.querySelectorAll('[data-place-option="from"]').length, 0);
  fail = true;
  type(dom, input, 'Odder'); await tick(350);
  assert.match(root.querySelector('[data-feedback="from"]').textContent, /Adresseopslag virker ikke/i);
});

test('ArrowUp wraps to last suggestion and stale search cannot replace a newer choice', async () => {
  let releaseOld;
  const old = new Promise((resolve) => { releaseOld = resolve; });
  const first = place('Aarhus H', 56.15);
  const second = place('Aarhus Universitet', 56.17);
  const { dom, root } = setup(async (query) => query === 'Aar' ? old : [first, second]);
  const input = root.querySelector('[name="to"]');
  type(dom, input, 'Aar'); await tick(310);
  type(dom, input, 'Aarhus'); await tick(310);
  assert.equal(root.querySelectorAll('[data-place-option="to"]').length, 2);
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  assert.equal(input.getAttribute('aria-activedescendant'), 'to-option-1');
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(input.value, second.label);
  releaseOld([place('Old result', 55)]); await tick();
  assert.equal(root.querySelectorAll('[data-place-option="to"]').length, 0);
  assert.equal(input.value, second.label);
});

test('arrival selection records the entered date and time as arrival', async () => {
  const { dom, root, wishes } = setup(async (query) => [place(query, 56)]);
  const form = root.querySelector('form');
  for (const field of ['from', 'to']) {
    type(dom, form.elements[field], field === 'from' ? 'Søndersø' : 'Dokk1');
    await tick(310);
    root.querySelector(`[data-place-option="${field}"]`).click();
  }
  form.elements.date.value = '2026-10-03';
  form.elements.time.value = '15:45';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(wishes[0].timeMode, 'arrival');
  assert.equal(wishes[0].arrival, '2026-10-03T15:45');
  assert.match(root.querySelector('#result').textContent, /Ønsket ankomst/);
});
