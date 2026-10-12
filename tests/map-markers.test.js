import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
test("map markers are asset-free, distinguish destination-only selection, and replace changed addresses", async () => {
  const dom = new JSDOM('<div id="map"></div>', {
    pretendToBeVisual: true,
    url: "https://example.test/RejseFlex/",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  const container = document.querySelector("#map");
  Object.defineProperty(container, "clientWidth", { value: 900 });
  Object.defineProperty(container, "clientHeight", { value: 700 });
  const { mountMap } = await import("../src/map.js");
  const map = mountMap(container);
  const from = {
      label: "Start <script>test</script>",
      coordinates: { latitude: 55.4, longitude: 10.4 },
    },
    to = { label: "Slut", coordinates: { latitude: 56.15, longitude: 10.2 } };
  map.show([to], { roles: ["to"] });
  assert.equal(container.querySelector(".journey-marker").textContent, "B");
  map.show([from, to], { roles: ["from", "to"] });
  assert.deepEqual(
    [...container.querySelectorAll(".journey-marker")].map(
      (e) => e.textContent,
    ),
    ["A", "B"],
  );
  assert.equal(container.querySelectorAll(".journey-marker img").length, 0);
  container.querySelector(".marker-origin").click();
  assert.equal(container.querySelector(".leaflet-popup-content script"), null);
  assert.match(
    container.querySelector(".leaflet-popup-content").textContent,
    /Start <script>/,
  );
  map.show([from], { roles: ["from"] });
  assert.equal(container.querySelectorAll(".journey-marker").length, 1);
  assert.equal(container.querySelector(".marker-destination"), null);
  map.show([]);
  assert.equal(container.querySelectorAll(".journey-marker").length, 0);
  dom.window.close();
});
