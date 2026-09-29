import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function workerScenario({ online, url, mode = 'navigate' }) {
  const handlers = {};
  const cache = new Map([[url, { text: 'old page' }]]);
  const put = [];
  const fetches = [];
  const scope = 'https://example.test/RejseFlex/';
  const context = {
    self: { registration: { scope }, location: { origin: 'https://example.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { match: async (request) => cache.get(request.url), open: async () => ({ put: async (request, response) => { put.push(request.url); cache.set(request.url, response); } }) },
    fetch: async (request) => { fetches.push(request.url); if (!online) throw new Error('offline'); return { ok: true, text: 'new page', clone() { return this; } }; },
    URL,
  };
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let response;
  handlers.fetch({ request: { url, method: 'GET', mode }, respondWith: (promise) => { response = promise; }, waitUntil: () => {} });
  return { response: response ? await response : undefined, fetches, put };
}

test('Pages reload gets current shell online and cached shell offline', async () => {
  const url = 'https://example.test/RejseFlex/';
  const online = await workerScenario({ online: true, url });
  assert.equal(online.response.text, 'new page');
  assert.deepEqual(online.fetches, [url]);
  const offline = await workerScenario({ online: false, url });
  assert.equal(offline.response.text, 'old page');
});

test('service worker never caches personal-looking runtime routes', async () => {
  const url = 'https://example.test/RejseFlex/user-journeys/private.json';
  const result = await workerScenario({ online: true, url, mode: 'same-origin' });
  assert.deepEqual(result.put, []);
});
