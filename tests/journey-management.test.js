import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { JSDOM } from "jsdom";
import { createJourneyStore } from "../src/journey-store.js";
import {
  proposeJourney,
  recordBookingTime,
  confirmBooking,
  confirmTrainChoice,
  confirmAssistance,
  editBookingTime,
  refreshTrainSuggestion,
  createDemoTrainSource,
} from "../src/journey.js";
import {
  withManualPrice,
  priceSummary,
  withMeetingInterval,
  meetingTime,
  localDateTime,
  copenhagenInstant,
} from "../src/journey-details.js";
import { prepareDocument, withDocumentReference } from "../src/documents.js";
import { stationSelect } from "../src/station-select.js";
import { exampleStations } from "../src/stations.js";
import { mountApp } from "../src/app.js";
import { renderJourney } from "../src/journey-view.js";
import { docxFixture, pdfFixture } from "./fixtures/documents.js";
const wish = {
  from: { label: "Start" },
  to: { label: "Slut" },
  timeMode: "arrival",
  arrival: "2026-10-20T14:00",
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

test("manual prices and meeting interval survive reopening; absent prices are never zero", async () => {
  const db = new IDBFactory();
  let plan = { ...(await proposeJourney(wish)), id: "one", selected: true };
  assert.equal(priceSummary(plan), null);
  plan = withManualPrice(plan, "outbound", "125,50");
  assert.deepEqual(priceSummary(plan), { cents: 12550, complete: false });
  plan = withManualPrice(plan, "train", "0");
  plan = withManualPrice(plan, "inbound", "99");
  plan = withMeetingInterval(plan, 30);
  await createJourneyStore(db).save(plan);
  const [reopened] = await createJourneyStore(db).list();
  assert.equal(reopened.assistanceInterval, 30);
  assert.deepEqual(priceSummary(reopened), { cents: 22450, complete: true });
  const removed = withManualPrice(reopened, "train", null);
  assert.deepEqual(priceSummary(removed), { cents: 22450, complete: false });
  assert.equal(removed.manualPrices.train, undefined);
  for (const value of ["-1", "abc", "1,234", "Infinity"])
    assert.throws(() => withManualPrice(plan, "train", value));
});
test("meeting time crosses midnight and follows confirmed assistance identity", async () => {
  const plan = await proposeJourney(wish);
  plan.legs[1].plannedDeparture = "2026-10-20T00:10:00+02:00";
  assert.equal(localDateTime(meetingTime(plan)), "2026-10-19T23:55");
  assert.equal(
    localDateTime(meetingTime(withMeetingInterval(plan, 30))),
    "2026-10-19T23:40",
  );
  const assistance = plan.tasks.find((task) => task.id === "assistance");
  assistance.confirmed = true;
  assistance.trainIdentity.plannedDeparture = "2026-10-20T12:00:00+02:00";
  assert.equal(localDateTime(meetingTime(plan)), "2026-10-20T11:45");
  assert.equal(
    copenhagenInstant("2026-10-20T13:00"),
    "2026-10-20T11:00:00.000Z",
  );
  assert.throws(() => copenhagenInstant("2026-03-29T02:30"));
});
test("local documents retain original bytes, replace atomically and delete with references", async () => {
  const db = new IDBFactory();
  let plan = { ...(await proposeJourney(wish)), id: "docs", selected: true };
  for (const [kind, name, bytes] of [
    ["assistance", "plan.docx", await docxFixture()],
    ["ticket", "billet.pdf", await pdfFixture()],
  ]) {
    const file = new File([bytes], name);
    const document = await prepareDocument(file, kind, plan.id);
    plan = withDocumentReference(plan, kind, document);
    await createJourneyStore(db).saveDocument(plan, document);
    const reopened = await createJourneyStore(db).getDocument(document.id);
    assert.equal(reopened.journeyId, "docs");
    assert.deepEqual(new Uint8Array(reopened.bytes), bytes);
  }
  const old = plan.documentReferences.find((ref) => ref.kind === "ticket");
  const replacement = await prepareDocument(
    new File([await pdfFixture()], "ny.pdf"),
    "ticket",
    plan.id,
  );
  plan = withDocumentReference(plan, "ticket", replacement);
  await createJourneyStore(db).saveDocument(plan, replacement, old.id);
  assert.equal(await createJourneyStore(db).getDocument(old.id), undefined);
  plan = withDocumentReference(plan, "ticket", null);
  await createJourneyStore(db).saveDocument(plan, null, replacement.id);
  assert.equal(
    await createJourneyStore(db).getDocument(replacement.id),
    undefined,
  );
  const [reopened] = await createJourneyStore(db).list();
  assert.deepEqual(
    reopened.documentReferences.map((ref) => ref.kind),
    ["assistance"],
  );
  await assert.rejects(
    prepareDocument(new File(["bad"], "bad.docx"), "assistance", plan.id),
    /DOCX/,
  );
  await assert.rejects(
    prepareDocument(new File(["bad"], "bad.pdf"), "ticket", plan.id),
    /PDF/,
  );
  await assert.rejects(
    prepareDocument(new File(["bad"], "bad.txt"), "ticket", plan.id),
    /PDF/,
  );
});
test("failed atomic document transaction preserves original reference and original bytes", async () => {
  const db = new IDBFactory();
  const store = createJourneyStore(db);
  const plan = {
    id: "atomic",
    documentReferences: [{ id: "old", kind: "ticket" }],
  };
  await store.saveDocument(plan, { id: "old", bytes: new ArrayBuffer(4) });
  await assert.rejects(
    store.saveDocument(
      { ...plan, documentReferences: [{ id: "new" }] },
      { bytes: new ArrayBuffer(2) },
      "old",
    ),
  );
  assert.deepEqual(
    (await store.list())[0].documentReferences,
    plan.documentReferences,
  );
  assert.ok(await store.getDocument("old"));
});
test("station combobox supports keyboard, clearing, no matches and legacy selection without accepting arbitrary names", () => {
  const dom = new JSDOM("<main></main>");
  const document = dom.window.document;
  let selected;
  const legacy = { id: "old-station", name: "Tidligere station" };
  const component = stationSelect(document, {
    label: "Afgangsstation",
    stations: exampleStations,
    selected: legacy,
    onChange: (value) => (selected = value),
  });
  document.body.append(component);
  const input = component.querySelector("input");
  assert.equal(input.value, legacy.name);
  input.dispatchEvent(new dom.window.FocusEvent("focus"));
  assert.match(component.textContent, /Tidligere station/);
  input.value = "Odense";
  input.dispatchEvent(new dom.window.Event("input"));
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "ArrowDown" }),
  );
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Enter" }),
  );
  assert.equal(selected.id, "example-odense");
  assert.equal(input.getAttribute("aria-expanded"), "false");
  component.querySelector("button").click();
  assert.equal(selected, null);
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "ArrowUp" }),
  );
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Enter" }),
  );
  assert.equal(selected.id, "example-aalborg");
  component.querySelector("button").click();
  input.value = "Findes ikke";
  input.dispatchEvent(new dom.window.Event("input"));
  assert.match(component.textContent, /Ingen stationer/);
  input.dispatchEvent(new dom.window.FocusEvent("blur"));
  assert.equal(input.value, "");
  assert.equal(selected, null);
});
test("explicit station selection coexists with automatic stations and street addresses", async () => {
  const automatic = { id: "automatic", name: "Automatisk station" };
  const source = createDemoTrainSource({
    stationSource: { nearby: async () => automatic },
  });
  const [auto] = await source.findConnections(wish);
  assert.equal(auto.fromStation.id, "automatic");
  const [explicit] = await source.findConnections({
    ...wish,
    stations: { from: exampleStations[1] },
  });
  assert.equal(explicit.fromStation.id, "example-odense");
  assert.equal(explicit.toStation.id, "automatic");
});
test("explicit edits of confirmed pickup time preserve confirmation and other confirmed agreements", async () => {
  let plan = await proposeJourney(wish);
  plan = await recordBookingTime(plan, "inbound", "2026-10-20T13:00");
  plan = confirmAssistance(confirmTrainChoice(confirmBooking(plan, "inbound")));
  plan = confirmBooking(
    await recordBookingTime(plan, "outbound", "2026-10-20T09:00"),
    "outbound",
  );
  const assistance = structuredClone(
    plan.tasks.find((task) => task.id === "assistance"),
  );
  const edited = await editBookingTime(plan, "outbound", "2026-10-20T09:15");
  assert.equal(edited.legs[0].actualBookingTime, "2026-10-20T09:15");
  assert.equal(
    edited.tasks.find((task) => task.id === "outbound").confirmed,
    true,
  );
  assert.deepEqual(
    edited.tasks.find((task) => task.id === "assistance"),
    assistance,
  );
  const recalculated = await refreshTrainSuggestion(edited);
  assert.equal(recalculated.legs[0].actualBookingTime, "2026-10-20T09:15");
  const inbound = await editBookingTime(edited, "inbound", "2026-10-20T12:00");
  assert.equal(
    inbound.tasks.find((task) => task.id === "inbound").confirmed,
    true,
  );
  assert.deepEqual(
    inbound.tasks.find((task) => task.id === "assistance"),
    assistance,
  );
});
test("overview has only three stages, no fare estimates, no price summary until manually supplied", async () => {
  const dom = new JSDOM(
    '<main id="app"><section id="result"></section></main>',
  );
  const root = dom.window.document.querySelector("#app");
  const plan = await proposeJourney(wish);
  plan.legs[0].priceEstimate = { kind: "known", estimatedPrice: 12345 };
  renderJourney(
    root,
    plan,
    () => {},
    () => {},
  );
  assert.equal(root.querySelectorAll("[data-journey-section]").length, 3);
  assert.equal(root.querySelectorAll(".booking-entry").length, 0);
  assert.equal(root.querySelector(".price-summary"), null);
  assert.doesNotMatch(root.textContent, /12345|ukendt pris/i);
  assert.ok(
    [...root.querySelectorAll(".price-editor")].every(
      (editor) => editor.hidden,
    ),
  );
  renderJourney(
    root,
    withManualPrice(plan, "outbound", "10"),
    () => {},
    () => {},
  );
  assert.match(
    root.querySelector(".price-summary").textContent,
    /Registrerede udgifter/,
  );
});
test("UI changes persist and reopen via the real IndexedDB store; suspended fares are not executed", async () => {
  const db = new IDBFactory();
  const dom = new JSDOM('<main id="app"></main>', {
    url: "https://example.test/RejseFlex/",
  });
  const root = dom.window.document.querySelector("#app");
  mountApp(root, {
    journeyStore: createJourneyStore(db),
    roadDistanceSource: {
      distanceKm: () => {
        throw new Error("fare path must not execute");
      },
    },
  });
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
  root.querySelector("[data-select-plan]").click();
  await tick();
  root.querySelector('[data-meeting-interval="30"]').click();
  await tick();
  root.querySelector('[data-price-action="train"]').click();
  const input = root.querySelector('[data-manual-price="train"]');
  input.value = "125,50";
  input
    .closest("form")
    .dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  await tick();
  const [saved] = await createJourneyStore(db).list();
  assert.equal(saved.assistanceInterval, 30);
  assert.equal(saved.manualPrices.train, 12550);
  assert.equal(saved.legs[0].priceEstimate.kind, "unknown");
  const dom2 = new JSDOM('<main id="app"></main>', {
    url: "https://example.test/RejseFlex/",
  });
  const root2 = dom2.window.document.querySelector("#app");
  mountApp(root2, { journeyStore: createJourneyStore(db) });
  await tick();
  root2.querySelector("[data-open-plan]").click();
  assert.equal(
    root2
      .querySelector('[data-meeting-interval="30"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.match(root2.querySelector(".price-summary").textContent, /125,50/);
});

test("demo train anchor and legacy local wishes use Copenhagen time independently of device timezone", async () => {
  const [train] = await createDemoTrainSource().findConnections(wish);
  assert.equal(train.plannedDeparture, "2026-10-20T09:00:00.000Z");
  assert.equal(localDateTime("2026-10-20T14:00"), "2026-10-20T14:00");
});
