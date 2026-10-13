import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { proposeJourney } from "../src/journey.js";
import { renderJourney } from "../src/journey-view.js";

test("saved journey opens locked and explicitly offers all four times with cancel", async () => {
  const plan = {
    ...(await proposeJourney({
      from: { label: "Start" },
      to: { label: "Slut" },
      arrival: "2026-10-20T14:00",
    })),
    selected: true,
  };
  const dom = new JSDOM('<section id="result"></section>');
  const root = dom.window.document.body;
  renderJourney(
    root,
    plan,
    () => {},
    () => {},
  );
  assert.equal(
    [...root.querySelectorAll("input")].filter(
      (n) =>
        !n.hidden &&
        !n.closest("[hidden]") &&
        !n.closest("details:not([open])"),
    ).length,
    0,
  );
  root.querySelector("[data-edit-details]").click();
  assert.equal(root.querySelectorAll("[data-detail-time]").length, 4);
  root.querySelector("[data-cancel-details]").click();
  assert.equal(
    [...root.querySelectorAll("input")].filter(
      (n) =>
        !n.hidden &&
        !n.closest("[hidden]") &&
        !n.closest("details:not([open])"),
    ).length,
    0,
  );
});

import { IDBFactory } from "fake-indexeddb";
import { createJourneyStore } from "../src/journey-store.js";
import { mountApp } from "../src/app.js";
import {
  withJourneyDetails,
  confirmBooking,
  confirmTrainChoice,
  confirmAssistance,
} from "../src/journey.js";
import { localDateTime, meetingTime } from "../src/journey-details.js";
const values = {
  times: {
    outbound: "2026-10-20T09:30",
    departure: "2026-10-20T11:00",
    arrival: "2026-10-20T12:30",
    inbound: "2026-10-20T13:00",
  },
  selfManaged: { outbound: false, inbound: false },
};
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("UI state did not settle");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test("all four times persist; explicit edit recalculates meeting without altering confirmed assistance or other data", async () => {
  const store = createJourneyStore(new IDBFactory());
  let plan = {
    ...(await proposeJourney({
      from: { label: "Start" },
      to: { label: "Slut" },
      arrival: "2026-10-20T14:00",
    })),
    id: "details",
    selected: true,
    manualPrices: { outbound: 5000 },
    documentReferences: [{ id: "doc", kind: "ticket", name: "billet.pdf" }],
  };
  plan = withJourneyDetails(plan, values);
  plan = confirmAssistance(confirmTrainChoice(confirmBooking(plan, "inbound")));
  const changed = withJourneyDetails(plan, {
    ...values,
    times: { ...values.times, departure: "2026-10-20T11:15" },
  });
  assert.equal(localDateTime(meetingTime(changed)), "2026-10-20T11:00");
  assert.equal(
    localDateTime(
      plan.tasks.find((t) => t.id === "assistance").trainIdentity
        .plannedDeparture,
    ),
    "2026-10-20T11:00",
  );
  assert.equal(
    changed.tasks.find((t) => t.id === "assistance").confirmed,
    true,
  );
  assert.ok(
    changed.conflicts.some((c) => c.code === "assistance-train-changed"),
  );
  await store.save(changed);
  const [saved] = await store.list();
  assert.deepEqual(saved.documentReferences, plan.documentReferences);
  assert.deepEqual(saved.manualPrices, plan.manualPrices);
  assert.equal(
    localDateTime(saved.legs[0].actualBookingTime),
    values.times.outbound,
  );
  assert.equal(
    localDateTime(saved.legs[1].plannedArrival),
    values.times.arrival,
  );
  assert.equal(
    localDateTime(saved.legs[2].actualBookingTime),
    values.times.inbound,
  );
});

test("partial legacy journey supports cancel and atomic save through the actual UI", async () => {
  const db = new IDBFactory(),
    store = createJourneyStore(db);
  const plan = {
    ...(await proposeJourney({
      from: { label: "Start" },
      to: { label: "Slut" },
      arrival: "2026-10-20T14:00",
    })),
    id: "partial",
    selected: true,
  };
  plan.legs[1].plannedDeparture = null;
  plan.legs[1].plannedArrival = null;
  await store.save(plan);
  const dom = new JSDOM('<main id="app"></main>');
  const root = dom.window.document.querySelector("main");
  mountApp(root, { journeyStore: store });
  await until(() => root.querySelector("[data-open-plan]"));
  root.querySelector("[data-open-plan]").click();
  assert.match(
    root.querySelector(".missing-summary").textContent,
    /togankomst|togafgang/,
  );
  assert.deepEqual(
    [...root.querySelectorAll("[data-stage]")].map((n) => n.dataset.stage),
    ["outbound", "train", "inbound"],
  );
  root.querySelector("[data-edit-details]").click();
  root.querySelector('[data-detail-time="departure"]').value =
    values.times.departure.slice(11);
  root.querySelector("[data-cancel-details]").click();
  assert.equal((await store.list())[0].legs[1].plannedDeparture, null);
  root.querySelector("[data-edit-details]").click();
  root.querySelector('[data-detail-time="outbound"]').value =
    values.times.outbound.slice(11);
  root.querySelector('[data-detail-time="departure"]').value =
    values.times.departure.slice(11);
  root.querySelector('[data-manual-price="outbound"]').value = "50,50";
  root.querySelector("[data-save-details]").click();
  await until(() => root.querySelector(".journey-editor-host").hidden);
  assert.equal(root.querySelector(".journey-editor-host").hidden, true);
  assert.equal(root.querySelector("[data-detail-time]"), null);
  const [saved] = await store.list();
  assert.equal(saved.manualPrices.outbound, 5050);
  assert.equal(
    localDateTime(saved.legs[1].plannedDeparture),
    values.times.departure,
  );
  assert.equal(saved.legs[1].plannedArrival, null);
  assert.equal(
    saved.tasks.find((t) => t.id === "outbound").confirmed,
    undefined,
  );
});

test("invalid times roll back and manual train times never disappear during pickup replanning", async () => {
  const plan = {
    ...(await proposeJourney({
      from: { label: "Start" },
      to: { label: "Slut" },
      arrival: "2026-10-20T14:00",
    })),
    id: "manual",
    selected: true,
  };
  plan.legs[1].plannedDeparture = null;
  plan.legs[1].plannedArrival = null;
  const entered = withJourneyDetails(plan, values);
  assert.throws(
    () =>
      withJourneyDetails(entered, {
        ...values,
        times: { ...values.times, arrival: "2026-10-20T10:00" },
      }),
    /ankomst/,
  );
  assert.equal(
    localDateTime(entered.legs[1].plannedArrival),
    values.times.arrival,
  );
  const conflict = withJourneyDetails(entered, {
    ...values,
    times: { ...values.times, inbound: "2026-10-20T12:00" },
  });
  assert.ok(
    conflict.conflicts.some((c) => c.code === "no-train-before-pickup"),
  );
  const self = withJourneyDetails(conflict, {
    ...values,
    selfManaged: { outbound: true, inbound: true },
    times: { departure: values.times.departure, arrival: values.times.arrival },
  });
  assert.equal(
    self.conflicts.some((c) => c.code === "no-train-before-pickup"),
    false,
  );
  const { editBookingTime } = await import("../src/journey.js");
  const confirmed = confirmBooking(entered, "inbound");
  const edited = await editBookingTime(
    confirmed,
    "inbound",
    "2026-10-20T12:00:00Z",
    {
      trainSource: {
        findConnections() {
          throw new Error("Manual times must not be replaced");
        },
      },
    },
  );
  assert.equal(
    edited.legs[1].plannedDeparture,
    entered.legs[1].plannedDeparture,
  );
  assert.equal(edited.legs[1].plannedArrival, entered.legs[1].plannedArrival);
});

test("new route opens information entry with empty demo times and saves a partial overview", async () => {
  const store = createJourneyStore(new IDBFactory());
  const dom = new JSDOM('<main id="app"></main>');
  const root = dom.window.document.querySelector("main");
  mountApp(root, { journeyStore: store });
  const form = root.querySelector("#journey-form");
  form.elements.from.value = "Start";
  form.elements.to.value = "Slut";
  form.elements.date.value = "2026-10-20";
  form.elements.time.value = "14:00";
  form.elements.handicapProvider.value = "FYNBUS";
  form.dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await tick();
  assert.equal(root.querySelector(".journey-editor-host").hidden, false);
  assert.equal(root.querySelector("[data-save-details]").textContent, "Gem og vis rejseoverblik");
  assert.equal(root.querySelector('[data-detail-time="departure"]').value, "");
  assert.equal(root.querySelector('[data-detail-time="arrival"]').value, "");
  root.querySelector('[data-detail-time="departure"]').value =
    values.times.departure.slice(11);
  root.querySelector("[data-save-details]").click();
  await until(() => root.querySelector(".journey-editor-host").hidden);
  const [saved] = await store.list();
  assert.equal(saved.selected, true);
  assert.equal(saved.legs[1].plannedArrival, null);
  assert.equal(
    saved.tasks.find((t) => t.id === "inbound").actualBookingTime,
    null,
  );
  assert.equal(root.querySelector(".journey-editor-host").hidden, true);
  assert.match(
    root.querySelector(".missing-summary").textContent,
    /togankomst|togafgang/,
  );
});
