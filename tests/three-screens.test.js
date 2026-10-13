import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { createJourneyStore } from "../src/journey-store.js";
import { mountApp } from "../src/app.js";
import {
  journeyDate,
  resolveJourneyTimes,
  localDateTime,
  meetingTime,
} from "../src/journey-details.js";
import { prepareDocument } from "../src/documents.js";
import { docxFixture, pdfFixture } from "./fixtures/documents.js";
const wish = {
  from: { label: "Start" },
  to: { label: "Slut" },
  timeMode: "departure",
  departure: "2026-10-20T23:00",
};
async function until(condition) {
  const end = Date.now() + 3000;
  while (!(await condition())) {
    if (Date.now() > end) throw Error("UI did not settle");
    await new Promise((r) => setTimeout(r, 5));
  }
}
function setup(store, options = {}) {
  const dom = new JSDOM('<main id="app"></main>', {
    url: options.url ?? "https://example.test/",
  });
  const root = dom.window.document.querySelector("main");
  mountApp(root, { journeyStore: store, ...options });
  return { dom, root };
}
function type(root, selector, value) {
  const input = root.querySelector(selector);
  assert.ok(input, selector);
  input.value = value;
  input.dispatchEvent(
    new root.ownerDocument.defaultView.Event("input", { bubbles: true }),
  );
  return input;
}
async function planRoute(root) {
  const form = root.querySelector("#journey-form");
  form.elements.from.value = "Start";
  form.elements.to.value = "Slut";
  form.elements.date.value = "2026-10-20";
  form.elements.time.value = "23:00";
  form.elements.timeMode.value = "departure";
  form.elements.handicapProvider.value = "FYNBUS";
  form.dispatchEvent(
    new root.ownerDocument.defaultView.Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
  await until(() => root.querySelector("[data-screen=edit]"));
}
async function save(root) {
  root.querySelector("[data-save-details]").click();
  await until(() => root.querySelector("[data-screen=overview]"));
}
async function upload(root, kind, file) {
  const input = root.querySelector(`[data-upload-document=${kind}]`);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new root.ownerDocument.defaultView.Event("change"));
  await until(() =>
    root.querySelector(".edit-documents").textContent.includes(file.name),
  );
}

test("clock-only editing resolves forward/backward midnight and explicit corrections in Copenhagen", () => {
  const departure = { wish };
  const clocks = {
    outbound: "23:00",
    departure: "23:50",
    arrival: "00:30",
    inbound: "00:45",
  };
  assert.deepEqual(resolveJourneyTimes(departure, clocks), {
    outbound: "2026-10-20T23:00",
    departure: "2026-10-20T23:50",
    arrival: "2026-10-21T00:30",
    inbound: "2026-10-21T00:45",
  });
  const arrival = {
    wish: { ...wish, timeMode: "arrival", arrival: "2026-10-21T01:00" },
  };
  assert.deepEqual(
    resolveJourneyTimes(arrival, clocks),
    resolveJourneyTimes(departure, clocks),
  );
  assert.equal(
    resolveJourneyTimes(
      departure,
      { departure: "00:10" },
      { departure: "2026-10-21" },
    ).departure,
    "2026-10-21T00:10",
  );
  assert.throws(
    () =>
      resolveJourneyTimes(
        { wish: { ...wish, departure: "2026-03-29T01:00" } },
        { departure: "02:30" },
      ),
    /sommertid/,
  );
});

test("three screens preserve route and drafts, ticket choices, overnight times and read-only reopening", async () => {
  const store = createJourneyStore(new IDBFactory());
  const { root } = setup(store);
  assert.equal(root.querySelector(".planner-screen [data-open-import]"), null);
  assert.equal(root.querySelector(".station-settings").open, true);
  await planRoute(root);
  assert.deepEqual(
    [...root.querySelectorAll("[data-edit-section]")].map(
      (n) => n.dataset.editSection,
    ),
    ["outbound", "train", "inbound", "documents"],
  );
  assert.equal(root.querySelectorAll("[data-ticket-type]").length, 2);
  assert.ok(
    [...root.querySelectorAll("[data-ticket-type]")].every(
      (n) => n.getAttribute("aria-pressed") === "false",
    ),
  );
  for (const [id, value] of Object.entries({
    outbound: "23:00",
    departure: "23:50",
    arrival: "00:30",
    inbound: "00:45",
  }))
    type(root, `[data-detail-time=${id}]`, value);
  type(root, "[data-manual-price=train]", "125,50");
  root.querySelector("[data-ticket-type=dsb]").click();
  root.querySelector("[data-edit-route]").click();
  assert.equal(root.querySelector(".planner-screen").hidden, false);
  const form = root.querySelector("#journey-form");
  assert.equal(form.elements.from.value, "Start");
  assert.equal(form.elements.date.value, "2026-10-20");
  assert.equal(form.elements.time.value, "23:00");
  assert.ok(root.querySelector(".station-settings input").value);
  root.querySelector("[data-return-journey]").click();
  assert.equal(root.querySelector("[data-detail-time=arrival]").value, "00:30");
  assert.equal(
    root.querySelector("[data-ticket-type=dsb]").getAttribute("aria-pressed"),
    "true",
  );
  await save(root);
  assert.equal(root.querySelector("#result input"), null);
  assert.equal(root.querySelector("[data-upload-document]"), null);
  assert.equal(root.querySelector("#result [data-confirm-assistance]"), null);
  assert.equal(root.querySelector("#result [data-ticket-type]"), null);
  assert.doesNotMatch(
    root.querySelector("#result").textContent,
    /Oplys afhentningstid|Tilføj togtider|Redigér stationer/,
  );
  assert.match(
    root.querySelector("[data-ticket-summary]").textContent,
    /Togbillet: DSB.*DSB-appen/,
  );
  assert.deepEqual(
    [...root.querySelectorAll("[data-event]")].map((n) => n.dataset.event),
    ["outbound", "assistance", "departure", "arrival", "inbound"],
  );
  const [saved] = await store.list();
  assert.equal(localDateTime(saved.legs[1].plannedArrival), "2026-10-21T00:30");
  assert.equal(localDateTime(meetingTime(saved)), "2026-10-20T23:35");
  assert.equal(saved.manualPrices.train, 12550);
  const second = setup(store);
  await until(() => second.root.querySelector("[data-open-plan]"));
  second.root.querySelector("[data-open-plan]").click();
  assert.equal(second.root.querySelector("#result").dataset.screen, "overview");
  second.root.querySelector("[data-edit-details]").click();
  second.root.querySelector("[data-ticket-type=rejsekort]").click();
  await save(second.root);
  assert.match(
    second.root.querySelector("[data-ticket-summary]").textContent,
    /Rejsekort – husk at tjekke ind/,
  );
  second.root.querySelector("[data-edit-details]").click();
  second.root.querySelector("[data-ticket-type=rejsekort]").click();
  second.root.querySelector("[data-cancel-details]").click();
  assert.equal((await store.list())[0].ticketType, "rejsekort");
  second.root.querySelector("[data-edit-details]").click();
  second.root.querySelector("[data-ticket-type=rejsekort]").click();
  await save(second.root);
  assert.equal((await store.list())[0].ticketType, null);
  assert.match(
    second.root.querySelector("[data-ticket-summary]").textContent,
    /ikke angivet/,
  );
});

test("both document categories stage, replace, cancel and save atomically with ticket form independent", async () => {
  const store = createJourneyStore(new IDBFactory());
  const { root } = setup(store);
  await planRoute(root);
  await upload(root, "ticket", new File([await pdfFixture()], "plads.pdf"));
  await upload(
    root,
    "assistance",
    new File([await docxFixture()], "rejse.docx"),
  );
  assert.equal((await store.list()).length, 0);
  await save(root);
  const [original] = await store.list();
  assert.equal(original.ticketType, null);
  assert.equal(original.documentReferences.length, 2);
  assert.ok(root.querySelector("[data-open-document=ticket]"));
  assert.ok(root.querySelector("[data-open-document=assistance]"));
  for (const ref of original.documentReferences)
    assert.ok((await store.getDocument(ref.id)).bytes.byteLength);
  root.querySelector("[data-edit-details]").click();
  await upload(
    root,
    "ticket",
    new File([await pdfFixture()], "replacement.pdf"),
  );
  root.querySelector("[data-cancel-details]").click();
  assert.deepEqual(
    (await store.list())[0].documentReferences,
    original.documentReferences,
  );
  root.querySelector("[data-edit-details]").click();
  await upload(
    root,
    "ticket",
    new File([await pdfFixture()], "replacement.pdf"),
  );
  await upload(root, "assistance", new File([await pdfFixture()], "rejse.pdf"));
  await save(root);
  const [changed] = await store.list();
  assert.deepEqual(changed.documentReferences.map((r) => r.name).sort(), [
    "rejse.pdf",
    "replacement.pdf",
  ]);
  for (const ref of original.documentReferences)
    assert.equal(await store.getDocument(ref.id), undefined);
  const reopened = setup(store);
  await until(() => reopened.root.querySelector("[data-open-plan]"));
  reopened.root.querySelector("[data-open-plan]").click();
  assert.match(
    reopened.root.querySelector(".journey-quick-access").textContent,
    /rejse.pdf/,
  );
});

test("document transaction failure retains every original byte and journey field", async () => {
  const store = createJourneyStore(new IDBFactory());
  const plan = { id: "atomic", wish, documentReferences: [], ticketType: null };
  const first = await prepareDocument(
    new File([await pdfFixture()], "original.pdf"),
    "ticket",
    plan.id,
  );
  plan.documentReferences = [
    { id: first.id, kind: "ticket", name: first.name },
  ];
  await store.saveDocument(plan, first);
  const replacement = await prepareDocument(
    new File([await pdfFixture()], "new.pdf"),
    "ticket",
    plan.id,
  );
  await assert.rejects(
    store.saveDocuments({ ...plan, ticketType: "dsb" }, [
      { document: replacement, previousId: first.id },
      { document: { id: "bad", fn: () => {} }, previousId: null },
    ]),
  );
  assert.equal((await store.list())[0].ticketType, null);
  assert.ok(await store.getDocument(first.id));
  assert.equal(await store.getDocument(replacement.id), undefined);
});

test("all four transport choices retain hidden values and require independent staged assistance confirmation", async () => {
  for (const [firstSelf, lastSelf] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]) {
    const store = createJourneyStore(new IDBFactory());
    const { root } = setup(store);
    await planRoute(root);
    for (const [id, value] of Object.entries({
      outbound: "09:00",
      departure: "10:00",
      arrival: "11:30",
      inbound: "11:45",
    }))
      type(root, `[data-detail-time=${id}]`, value);
    type(root, "[data-manual-price=outbound]", "50");
    type(root, "[data-manual-price=inbound]", "25");
    for (const [id, enabled] of [
      ["outbound", firstSelf],
      ["inbound", lastSelf],
    ]) {
      const check = root.querySelector(`[data-self-transport=${id}]`);
      check.checked = enabled;
      check.dispatchEvent(
        new root.ownerDocument.defaultView.Event("change", { bubbles: true }),
      );
      assert.equal(
        root.querySelector(`[data-edit-section=${id}] .edit-fields`).hidden,
        enabled,
      );
    }
    assert.equal(root.querySelector("[data-confirm-assistance]"), null);
    if (!lastSelf) root.querySelector("[data-confirm-booking]").click();
    root.querySelector("[data-confirm-train]").click();
    assert.ok(root.querySelector("[data-confirm-assistance]"));
    assert.equal(root.querySelector("[data-confirm-booking-outbound]"), null);
    root.querySelector("[data-confirm-assistance]").click();
    if (!firstSelf)
      root.querySelector("[data-confirm-booking-outbound]").click();
    assert.equal((await store.list()).length, 0); // Every confirmation belongs to the draft until Save.
    await save(root);
    const [saved] = await store.list();
    assert.equal(
      saved.tasks.find((t) => t.id === "outbound").selfManaged,
      firstSelf,
    );
    assert.equal(
      saved.tasks.find((t) => t.id === "inbound").selfManaged,
      lastSelf,
    );
    assert.equal(
      saved.tasks.find((t) => t.id === "assistance").confirmed,
      true,
    );
    assert.equal(
      localDateTime(
        saved.tasks.find((t) => t.id === "outbound").actualBookingTime,
      ).slice(11),
      "09:00",
    );
    assert.equal(saved.manualPrices.outbound, 5000);
    assert.equal(saved.manualPrices.inbound, 2500);
    assert.equal(root.querySelector("#result input"), null);
  }
});

test("cancel after replanning restores the saved route and requested date as well as the details", async () => {
  const store = createJourneyStore(new IDBFactory());
  const { root } = setup(store);
  await planRoute(root);
  await save(root);
  const [original] = await store.list();
  root.querySelector("[data-edit-details]").click();
  root.querySelector("[data-edit-route]").click();
  const form = root.querySelector("#journey-form");
  form.elements.date.value = "2026-10-21";
  form.elements.time.value = "12:00";
  form.dispatchEvent(
    new root.ownerDocument.defaultView.Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
  await until(
    () =>
      root.querySelector("#result").dataset.screen === "edit" &&
      root.querySelector(".planner-screen").hidden,
  );
  root.querySelector("[data-cancel-details]").click();
  assert.match(root.querySelector(".journey-date").textContent, /20\. oktober/);
  assert.deepEqual((await store.list())[0], original);
});

test("replacing or removing an imported preview on screen 2 does not reattach the original at save", async () => {
  for (const remove of [false, true]) {
    const db = new IDBFactory(),
      store = createJourneyStore(db),
      imports = globalThis.RejseFlexImports.createStore(db);
    const record = await imports.stage(
      new File([await pdfFixture()], "imported.pdf", {
        type: "application/pdf",
      }),
    );
    const { root } = setup(store, {
      importStore: imports,
      url: `https://example.test/#import=${record.id}`,
    });
    await until(() => !root.querySelector("[data-import-targets]").hidden);
    root.querySelector("[data-import-new]").click();
    await until(() => !root.querySelector(".planner-screen").hidden);
    await planRoute(root);
    if (remove) {
      const row = root
        .querySelector("[data-upload-document=ticket]")
        .closest(".edit-document");
      [...row.querySelectorAll("button")]
        .find((b) => b.textContent === "Fjern")
        .click();
    } else
      await upload(
        root,
        "ticket",
        new File([await pdfFixture()], "edited.pdf"),
      );
    await save(root);
    const [saved] = await store.list();
    assert.deepEqual(
      saved.documentReferences.map((ref) => ref.name),
      remove ? [] : ["edited.pdf"],
    );
    assert.equal(await store.getDocument(`import-${record.id}`), undefined);
    assert.equal(await imports.get(record.id), undefined);
  }
});

test("a legacy confirmed booking without a registered pickup still permits a partial edit", async () => {
  const { proposeJourney } = await import("../src/journey.js");
  const store = createJourneyStore(new IDBFactory());
  const legacy = {
    ...(await proposeJourney(wish)),
    id: "legacy-missing-time",
    selected: true,
  };
  const booking = legacy.tasks.find((t) => t.id === "inbound");
  booking.confirmed = true;
  booking.status = "bestilt";
  legacy.legs[1].plannedDeparture = null;
  legacy.legs[1].plannedArrival = null;
  await store.save(legacy);
  const { root } = setup(store);
  await until(() => root.querySelector("[data-open-plan]"));
  root.querySelector("[data-open-plan]").click();
  assert.match(
    root.querySelector("[data-ticket-summary]").textContent,
    /ikke angivet/,
  );
  root.querySelector("[data-edit-details]").click();
  type(root, "[data-manual-price=train]", "100");
  await save(root);
  const [saved] = await store.list();
  assert.equal(saved.manualPrices.train, 10000);
  assert.equal(saved.tasks.find((t) => t.id === "inbound").confirmed, true);
  assert.equal(
    saved.tasks.find((t) => t.id === "inbound").actualBookingTime,
    null,
  );
});
