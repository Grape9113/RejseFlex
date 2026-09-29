import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountApp } from '../src/app.js';

test('from journey wish to a clearly marked demo journey', async () => {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://example.test/RejseFlex/' });
  const root = dom.window.document.querySelector('#app');
  mountApp(root);

  const form = root.querySelector('form');
  assert.ok(form);
  assert.match(root.textContent, /demo/i);
  form.elements.from.value = 'Søndersø';
  form.elements.to.value = 'Dock 1, Aarhus';
  form.elements.date.value = '2026-10-02'; form.elements.time.value = '14:00';
  form.elements.handicapProvider.value = 'FYNBUS';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(root.textContent, /Søndersø/);
  assert.match(root.textContent, /Dock 1, Aarhus/);
  assert.match(root.textContent, /14[.:]00/);
  assert.match(root.textContent, /demo/i);
  assert.equal(root.querySelectorAll('[data-journey-section]').length, 4);
  assert.deepEqual(
    [...root.querySelectorAll('[data-journey-section] h3')].map((heading) => heading.textContent),
    ['Handicapkørsel', 'Tog', 'Handicapservice', 'Handicapkørsel'],
  );
  assert.match(root.textContent, /bestiller ikke/i);
});
