import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountApp } from '../src/app.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function setup(store) {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  mountApp(root, { journeyStore: store });
  return { dom, root };
}
async function search(root) {
  const form = root.querySelector('form');
  form.elements.from.value = 'Søndersø';
  form.elements.to.value = 'Dock 1, Aarhus';
  form.elements.date.value = '2026-10-02'; form.elements.time.value = '14:00';
  form.dispatchEvent(new root.ownerDocument.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
}

test('only chosen rejseplan is locally saved and reopened after reload', async () => {
  const saved = new Map();
  const store = {
    list: async () => [...saved.values()],
    save: async (plan) => saved.set(plan.id, structuredClone(plan)),
  };
  const first = setup(store);
  await search(first.root);
  assert.equal(saved.size, 0);
  first.root.querySelector('[data-select-plan]').click();
  await tick();
  assert.equal(saved.size, 1);
  assert.match(first.root.textContent, /gemt på denne enhed/i);
  const second = setup(store);
  await tick();
  assert.match(second.root.textContent, /Gemte rejser/i);
  second.root.querySelector('[data-open-plan]').click();
  assert.match(second.root.querySelector('#result').textContent, /Søndersø/);
  assert.equal(second.root.querySelector('[data-select-plan]'), null);
});

test('failed local save keeps the rejseplan unselected and explains the failure', async () => {
  const store = { list: async () => [], save: async () => { throw new Error('quota'); } };
  const { root } = setup(store);
  await search(root);
  root.querySelector('[data-select-plan]').click();
  await tick();
  assert.ok(root.querySelector('[data-select-plan]'));
  assert.match(root.textContent, /ikke gemt/i);
});
