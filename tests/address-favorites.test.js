import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { createJourneyStore } from "../src/journey-store.js";
import { mountApp } from "../src/app.js";
const favorite = {
  id: "fav-cph",
  primary: "København",
  secondary: "Hovedstaden",
  label: "København, Danmark",
  coordinates: { latitude: 55.67, longitude: 12.56 },
  source: "test",
};
const other = {
  id: "other",
  label: "Kolding, Danmark",
  coordinates: { latitude: 55.49, longitude: 9.47 },
};
const tick = () => new Promise((r) => setTimeout(r, 20));
function app(store, search = async () => [favorite, other]) {
  const dom = new JSDOM('<main id="app"></main>');
  const root = dom.window.document.querySelector("#app");
  const points = [];
  mountApp(root, {
    geocoder: { search },
    journeyStore: store,
    map: { show: (places, roles) => points.push({ places, roles }) },
  });
  return { dom, root, points };
}
test("explicit favorites persist across reload, are shared, deduplicated and selectable offline", async () => {
  const db = new IDBFactory();
  const store = createJourneyStore(db);
  const first = app(store);
  await tick();
  const input = first.root.querySelector('[name="from"]');
  input.focus();
  input.value = "KY";
  input.dispatchEvent(new first.dom.window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 330));
  const star = first.root.querySelector('[data-favorite-key="fav-cph"]');
  star.click();
  await tick();
  assert.equal(input.value, "KY");
  assert.equal(first.points.at(-1).places.length, 0);
  assert.equal(
    first.root
      .querySelector('[data-favorite-key="fav-cph"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.deepEqual(await createJourneyStore(db).listFavorites(), [favorite]);
  assert.equal(
    first.root.querySelectorAll(
      '[data-options="from"] [data-favorite-key="fav-cph"]',
    ).length,
    1,
  );
  assert.match(
    first.root.querySelector('[data-options="from"]').textContent,
    /Favoritter.*København.*Søgeresultater.*Kolding/s,
  );
  const second = app(createJourneyStore(db), async () => {
    throw new Error("offline");
  });
  await tick();
  const to = second.root.querySelector('[name="to"]');
  to.focus();
  assert.match(
    second.root.querySelector('[data-options="to"]').textContent,
    /København/,
  );
  second.root.querySelector('[data-place-option="to"]').click();
  assert.equal(to.value, favorite.label);
  assert.deepEqual(second.points.at(-1).places, [favorite]);
  assert.deepEqual(second.points.at(-1).roles, { roles: ["to"] });
  assert.equal(to.getAttribute("aria-expanded"), "false");
  const from = second.root.querySelector('[name="from"]');
  from.focus();
  from.value = "XY";
  from.dispatchEvent(new second.dom.window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 330));
  assert.match(
    second.root.querySelector('[data-options="from"]').textContent,
    /Favoritter.*København/s,
  );
  second.root.querySelector('[data-favorite-key="fav-cph"]').click();
  await tick();
  assert.deepEqual(await store.listFavorites(), []);
});
test("ordinary queries and selections never create history or favorites; touch selection and editing preserve state", async () => {
  const db = new IDBFactory();
  const store = createJourneyStore(db);
  const { dom, root, points } = app(store);
  await tick();
  const input = root.querySelector('[name="from"]');
  input.focus();
  input.value = "Kø";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 330));
  const choice = root.querySelector('[data-place-option="from"]');
  choice.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
  input.blur();
  assert.equal(choice.isConnected, true);
  choice.click();
  assert.equal(input.value, favorite.label);
  assert.deepEqual(points.at(-1).places, [favorite]);
  assert.deepEqual(await store.listFavorites(), []);
  assert.deepEqual(await store.list(), []);
  input.value = "Ny";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(points.at(-1).places.length, 0);
  const dbRequest = db.open("rejseflex-local", 2);
  const opened = await new Promise((r) => {
    dbRequest.onsuccess = () => r(dbRequest.result);
  });
  const request = opened
    .transaction("settings")
    .objectStore("settings")
    .getAll();
  const settings = await new Promise((r) => {
    request.onsuccess = () => r(request.result);
  });
  opened.close();
  assert.equal(
    settings.some((item) => /history|recent/i.test(item.id)),
    false,
  );
});
test("concurrent favorite toggles are atomic and retain all metadata", async () => {
  const db = new IDBFactory();
  await Promise.all([
    createJourneyStore(db).toggleFavorite(favorite),
    createJourneyStore(db).toggleFavorite(other),
  ]);
  assert.equal((await createJourneyStore(db).listFavorites()).length, 2);
  await createJourneyStore(db).toggleFavorite(favorite);
  assert.deepEqual(await createJourneyStore(db).listFavorites(), [other]);
});
