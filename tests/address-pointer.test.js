import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountApp } from "../src/app.js";
const place = {
  id: "pointer-place",
  label: "Vestergade 12, Odense",
  coordinates: { latitude: 55.4, longitude: 10.38 },
};
test("holding a mouse press on a suggestion keeps it available until click chooses the full address", async () => {
  const dom = new JSDOM('<main id="app"></main>');
  const root = dom.window.document.querySelector("#app");
  const points = [];
  mountApp(root, {
    geocoder: { search: async () => [place] },
    map: { show: (p) => points.push(p) },
    journeyStore: { list: async () => [] },
  });
  const input = root.querySelector('[name="from"]');
  input.focus();
  input.value = "Vestergade";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 320));
  const option = root.querySelector('[data-place-option="from"]');
  const down = new dom.window.MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  option.dispatchEvent(down);
  if (!down.defaultPrevented) input.blur();
  await new Promise((r) => setTimeout(r, 180));
  assert.equal(
    option.isConnected,
    true,
    "blur must not discard a pending pointer selection",
  );
  option.click();
  assert.equal(input.value, place.label);
  assert.equal(points.at(-1)[0].id, place.id);
  assert.equal(input.getAttribute("aria-expanded"), "false");
});
