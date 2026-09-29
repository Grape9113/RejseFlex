import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountApp } from '../src/app.js';

function setup(search) {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  const shown = [];
  mountApp(root, { geocoder: { search }, map: { show: (points) => shown.push(points) } });
  return { dom, root, shown };
}

test('user searches and selects both addresses before planning', async () => {
  const calls = [];
  const places = {
    Søndersø: [{ id: 'a', label: 'Søndersø, Nordfyn, Danmark', coordinates: { latitude: 55.48, longitude: 10.25 } }],
    'Dock 1': [{ id: 'b', label: 'Dock 1, Aarhus, Danmark', coordinates: { latitude: 56.15, longitude: 10.21 } }],
  };
  const { dom, root, shown } = setup(async (query) => { calls.push(query); return places[query]; });
  const form = root.querySelector('form');
  form.elements.from.value = 'Søndersø';
  form.elements.to.value = 'Dock 1';
  assert.deepEqual(calls, []);
  for (const field of ['from', 'to']) {
    root.querySelector(`[data-search="${field}"]`).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.querySelector(`[data-place-option="${field}"]`).click();
  }
  assert.deepEqual(calls, ['Søndersø', 'Dock 1']);
  assert.equal(shown.at(-1).length, 2);
  assert.match(root.textContent, /aktuelle søgetekst.*ekstern/i);
  form.elements.arrival.value = '2026-10-02T14:00';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(root.querySelector('#result').textContent, /Søndersø, Nordfyn/);
});

test('no results and provider failure explain what happened without creating a journey', async () => {
  let fail = false;
  const { root } = setup(async () => { if (fail) throw new Error('network'); return []; });
  const field = root.querySelector('[name="from"]');
  field.value = 'Ukendt sted';
  root.querySelector('[data-search="from"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(root.textContent, /Ingen adresser fundet/i);
  fail = true;
  root.querySelector('[data-search="from"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(root.textContent, /Adresseopslag virker ikke lige nu/i);
  assert.equal(root.querySelector('#result').hidden, true);
});


test('map initialises after its container is rendered', () => {
  const dom = new JSDOM('<main id="app"></main>');
  const root = dom.window.document.querySelector('#app');
  let container;
  mountApp(root, { mapFactory: (node) => { container = node; return { show() {} }; } });
  assert.equal(container, root.querySelector('#address-map'));
});
