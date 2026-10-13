import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { JSDOM } from "jsdom";
import {
  proposeJourney,
  withSelfTransport,
  confirmTrainChoice,
  confirmAssistance,
  recordBookingTime,
  confirmBooking,
  activeConflicts,
} from "../src/journey.js";
import { createJourneyStore } from "../src/journey-store.js";
import { withManualPrice } from "../src/journey-details.js";
import { mountApp } from "../src/app.js";
const wish = {
  from: { label: "Start" },
  to: { label: "Slut" },
  timeMode: "arrival",
  arrival: "2026-10-20T14:00",
};
const task = (plan, id) => plan.tasks.find((item) => item.id === id);
test("self transport defaults off and all four combinations preserve route, train and manual prices", async () => {
  const original = withManualPrice(
    await proposeJourney(wish),
    "outbound",
    "45",
  );
  assert.equal(task(original, "outbound").selfManaged, false);
  assert.equal(task(original, "inbound").selfManaged, false);
  for (const first of [false, true])
    for (const last of [false, true]) {
      const plan = withSelfTransport(
        withSelfTransport(original, "outbound", first),
        "inbound",
        last,
      );
      assert.equal(task(plan, "outbound").selfManaged, first);
      assert.equal(task(plan, "inbound").selfManaged, last);
      assert.deepEqual(plan.legs, original.legs);
      assert.deepEqual(plan.wish, original.wish);
      assert.deepEqual(plan.manualPrices, original.manualPrices);
      assert.equal(
        task(plan, "train").status,
        last ? "klar til booking" : "ikke klar",
      );
      assert.equal(plan.nextAction.taskId, last ? "train" : "inbound");
    }
});
test("self-managed inbound unlocks train but preserves independent assistance booking; unchecking restores dependencies", async () => {
  const initial = await proposeJourney(wish);
  let plan = withSelfTransport(initial, "inbound", true);
  plan = confirmTrainChoice(plan);
  assert.equal(task(plan, "assistance").status, "klar til booking");
  const reverted = withSelfTransport(plan, "inbound", false);
  assert.equal(task(reverted, "assistance").status, "ikke klar");
  assert.throws(() => confirmAssistance(reverted));
  assert.equal(reverted.nextAction.taskId, "inbound");
  plan = confirmAssistance(plan);
  assert.equal(task(plan, "outbound").status, "klar til booking");
  await assert.rejects(
    recordBookingTime(plan, "inbound", "2026-10-20T13:00"),
    /selvtransport/,
  );
  assert.throws(() => confirmBooking(plan, "inbound"), /selvtransport/);
  const both = withSelfTransport(plan, "outbound", true);
  assert.equal(task(both, "outbound").selfManaged, true);
  assert.equal(task(both, "assistance").confirmed, true);
  const firstNeeded = withSelfTransport(both, "outbound", false);
  assert.equal(task(firstNeeded, "outbound").status, "klar til booking");
  const booked = confirmBooking(
    await recordBookingTime(firstNeeded, "outbound", "2026-10-20T09:00"),
    "outbound",
  );
  const own = withSelfTransport(booked, "outbound", true);
  assert.deepEqual(own.legs, booked.legs);
  assert.equal(
    task(own, "outbound").actualBookingTime,
    task(booked, "outbound").actualBookingTime,
  );
  assert.equal(task(own, "outbound").confirmed, true);
  assert.deepEqual(
    task(withSelfTransport(own, "outbound", false), "outbound"),
    task(booked, "outbound"),
  );
});
test("obsolete pickup conflicts stop blocking self transport and return when normal booking is needed", async () => {
  let plan = await proposeJourney(wish);
  plan = await recordBookingTime(plan, "inbound", "2026-10-20T13:00", {
    trainSource: { findConnections: async () => [] },
  });
  assert.equal(activeConflicts(plan).length, 1);
  const self = withSelfTransport(plan, "inbound", true);
  assert.equal(activeConflicts(self).length, 0);
  assert.doesNotThrow(() => confirmTrainChoice(self));
  assert.equal(
    activeConflicts(withSelfTransport(self, "inbound", false)).length,
    1,
  );
});
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("UI update timed out");
}
test("checkboxes are independent, persist through app reload, hide booking controls and retain prices", async () => {
  const db = new IDBFactory();
  const store = createJourneyStore(db);
  await store.save({
    ...(await proposeJourney(wish)),
    id: "self-ui",
    selected: true,
  });
  function setup() {
    const dom = new JSDOM('<main id="app"></main>');
    const root = dom.window.document.querySelector("#app");
    mountApp(root, { journeyStore: createJourneyStore(db) });
    return { dom, root };
  }
  const first = setup();
  await until(() => first.root.querySelector("[data-open-plan]"));
  first.root.querySelector("[data-open-plan]").click();
  first.root.querySelector("[data-edit-details]").click();
  assert.equal(first.root.querySelectorAll("[data-self-transport]").length, 2);
  assert.ok(
    [...first.root.querySelectorAll("[data-self-transport]")].every(
      (input) => !input.checked,
    ),
  );
  for (const id of ["outbound", "inbound"]) {
    const input = first.root.querySelector(`[data-self-transport="${id}"]`);
    input.checked = true;
    input.dispatchEvent(
      new first.dom.window.Event("change", { bubbles: true }),
    );
  }
  first.root.querySelector("[data-save-details]").click();
  await until(
    () => first.root.querySelectorAll("[data-self-transport]").length === 0,
  );
  assert.equal(first.root.querySelector("[data-booking-time]"), null);
  assert.equal(first.root.querySelector("[data-confirm-train]"), null);
  assert.match(first.root.querySelector(".booking-overview").textContent, /Ikke kontrolleret/);
  assert.match(
    first.root.querySelector("#result").textContent,
    /Selvtransport/,
  );
  const second = setup();
  await until(() => second.root.querySelector("[data-open-plan]"));
  second.root.querySelector("[data-open-plan]").click();
  second.root.querySelector("[data-edit-details]").click();
  assert.ok(
    [...second.root.querySelectorAll("[data-self-transport]")].every(
      (input) => input.checked,
    ),
  );
  const input = second.root.querySelector('[data-self-transport="inbound"]');
  input.checked = false;
  input.dispatchEvent(new second.dom.window.Event("change", { bubbles: true }));
  second.root.querySelector("[data-save-details]").click();
  await until(
    () => second.root.querySelectorAll("[data-self-transport]").length === 0,
  );
  second.root.querySelector("[data-edit-details]").click();
  assert.equal(
    second.root.querySelector('[data-self-transport="outbound"]').checked,
    true,
  );
  assert.equal(second.root.querySelector("[data-confirm-train]"), null);
  const [saved] = await store.list();
  assert.equal(task(saved, "outbound").selfManaged, true);
  assert.equal(task(saved, "inbound").selfManaged, false);
});
