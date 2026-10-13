import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { mountApp } from "../src/app.js";
test("manual station selection starts expanded but can still be collapsed", () => {
  const dom = new JSDOM('<main id="app"></main>');
  mountApp(dom.window.document.querySelector("#app"), {
    journeyStore: { list: async () => [] },
  });
  const section = dom.window.document.querySelector(".station-settings");
  assert.equal(section.open, true);
  section.open = false;
  assert.equal(section.open, false);
  section.open = true;
  assert.equal(section.querySelectorAll('[role="combobox"]').length, 2);
});

test("document categories depend only on extension and consistent MIME, never contents", async () => {
  await import("../public/import-storage.js");
  const { classifyFile } = globalThis.RejseFlexImports;
  assert.equal(
    classifyFile({
      name: "PLAN.DOCX",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "assistance",
  );
  assert.equal(
    classifyFile({ name: "billet.Pdf", type: "application/pdf" }),
    "ticket",
  );
  for (const type of ["", "application/octet-stream", "application/zip"])
    assert.equal(classifyFile({ name: "plan.docx", type }), "assistance");
  assert.equal(
    classifyFile({ name: "billet.pdf", type: "application/x-pdf" }),
    "ticket",
  );
  for (const file of [
    { name: "plan.xml", type: "application/xml" },
    { name: "plan.docx", type: "application/pdf" },
    { name: "billet.pdf", type: "application/zip" },
    { name: "plan.docx", type: "application/msword" },
    { name: "image.png", type: "image/png" },
  ])
    assert.throws(() => classifyFile(file));
});

test("temporary imports retain original files and progress across reload and clear on cancellation", async () => {
  const db = new IDBFactory();
  const store = globalThis.RejseFlexImports.createStore(db);
  const record = await store.stage(
    new File(["untouched bytes"], "PLAN.DOCX", {
      type: "application/octet-stream",
    }),
  );
  await store.put({ ...record, mode: "new", step: "planning" });
  const reloaded = await globalThis.RejseFlexImports.createStore(db).get(
    record.id,
  );
  assert.equal(reloaded.kind, "assistance");
  assert.equal(new TextDecoder().decode(reloaded.bytes), "untouched bytes");
  assert.equal(reloaded.step, "planning");
  await store.remove(record.id);
  assert.equal(await store.get(record.id), undefined);
  await assert.rejects(store.stage(new File([], "empty.pdf")));
  await assert.rejects(
    store.stage({
      name: "missing.pdf",
      type: "application/pdf",
      size: 10,
      arrayBuffer: async () => {
        throw new Error("unavailable");
      },
    }),
  );
});

test("share reception stores files locally and redirects to the scoped import screen; invalid shares never become drafts", async () => {
  const store = globalThis.RejseFlexImports.createStore(new IDBFactory());
  const { receiveShare } = globalThis.RejseFlexImports;
  const form = new FormData();
  form.append(
    "documents",
    new File(["original"], "billet.pdf", { type: "application/octet-stream" }),
  );
  const response = await receiveShare(
    new Request("https://example.test/RejseFlex/share-target", {
      method: "POST",
      body: form,
    }),
    "https://example.test/RejseFlex/",
    store,
  );
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.pathname, "/RejseFlex/");
  const id = new URLSearchParams(location.hash.slice(1)).get("import");
  assert.ok(id);
  assert.equal((await store.get(id)).kind, "ticket");
  const invalid = await receiveShare(
    new Request("https://example.test/RejseFlex/share-target", {
      method: "POST",
      body: new FormData(),
    }),
    "https://example.test/RejseFlex/",
    store,
  );
  assert.match(invalid.headers.get("Location"), /import-error=missing/);
});

test("import completion preserves current journey fields and other documents and refuses unconfirmed replacement", async () => {
  const { createJourneyStore } = await import("../src/journey-store.js");
  const store = createJourneyStore(new IDBFactory());
  const plan = {
    id: "existing",
    wish: { from: { label: "A" }, to: { label: "B" } },
    manualPrices: { train: 12300 },
    documentReferences: [{ id: "old-pdf", kind: "ticket", name: "old.pdf" }],
  };
  await store.saveDocument(plan, {
    id: "old-pdf",
    journeyId: plan.id,
    bytes: new ArrayBuffer(1),
  });
  const doc = {
    id: "import-one",
    kind: "assistance",
    name: "plan.docx",
    journeyId: plan.id,
    bytes: new ArrayBuffer(4),
  };
  const updated = await store.completeImport(plan, doc);
  assert.deepEqual(updated.manualPrices, plan.manualPrices);
  assert.equal(updated.documentReferences.length, 2);
  await assert.rejects(
    store.completeImport(plan, { ...doc, id: "replacement" }),
    /erstattes/,
  );
  const replaced = await store.completeImport(
    plan,
    { ...doc, id: "replacement" },
    { expectedDocumentId: "import-one" },
  );
  assert.equal(
    replaced.documentReferences.find((ref) => ref.kind === "assistance").id,
    "replacement",
  );
  assert.ok(await store.getDocument("old-pdf"));
  assert.equal(await store.getDocument("import-one"), undefined);
});

const wait = async (check) => {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("Import UI timed out");
};
test("manual import selects category automatically, confirms replacement and opens the saved journey", async () => {
  const { createJourneyStore } = await import("../src/journey-store.js");
  const { proposeJourney } = await import("../src/journey.js");
  const db = new IDBFactory();
  const store = createJourneyStore(db);
  const imports = globalThis.RejseFlexImports.createStore(db);
  const plan = {
    ...(await proposeJourney({
      from: { label: "A" },
      to: { label: "B" },
      arrival: "2026-10-20T14:00",
    })),
    id: "ui-existing",
    selected: true,
  };
  await store.save(plan);
  const dom = new JSDOM('<main id="app"></main>', {
    url: "https://example.test/RejseFlex/",
  });
  const root = dom.window.document.querySelector("#app");
  mountApp(root, { journeyStore: store, importStore: imports });
  root.querySelector("[data-open-import]").click();
  const input = root.querySelector("[data-import-file]");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [
      new File(["original"], "plan.docx", { type: "application/octet-stream" }),
    ],
  });
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await wait(
    () => root.querySelector("[data-import-name]")?.textContent === "plan.docx",
  );
  assert.match(root.querySelector(".import-screen").textContent, /Rejseplan/);
  root.querySelector("[data-import-existing]").click();
  await wait(() => root.querySelector("[data-import-journey]"));
  root.querySelector("[data-import-journey]").click();
  await wait(() => !root.querySelector("[data-confirm-import]").disabled);
  root.querySelector("[data-confirm-import]").click();
  await wait(() =>
    root.querySelector("#result")?.textContent.includes("plan.docx"),
  );
  assert.equal(
    (await store.list())[0].documentReferences[0].kind,
    "assistance",
  );
});

test("new-journey import survives navigation/reload and saves no journey until explicit confirmation", async () => {
  const { createJourneyStore } = await import("../src/journey-store.js");
  const db = new IDBFactory();
  const store = createJourneyStore(db);
  const imports = globalThis.RejseFlexImports.createStore(db);
  const record = await imports.stage(
    new File(["original ticket"], "billet.pdf", { type: "application/pdf" }),
  );
  function setup(hash) {
    const dom = new JSDOM('<main id="app"></main>', {
      url: `https://example.test/RejseFlex/${hash}`,
    });
    const root = dom.window.document.querySelector("#app");
    mountApp(root, { journeyStore: store, importStore: imports });
    return { dom, root };
  }
  const first = setup(`#import=${record.id}`);
  await wait(() => !first.root.querySelector("[data-import-targets]").hidden);
  first.root.querySelector("[data-import-new]").click();
  await wait(() => !first.root.querySelector(".planner-screen").hidden);
  assert.equal((await store.list()).length, 0);
  const form = first.root.querySelector("#journey-form");
  form.elements.from.value = "Start";
  form.elements.to.value = "Slut";
  form.elements.date.value = "2026-10-20";
  form.elements.time.value = "14:00";
  form.elements.handicapProvider.value = "FYNBUS";
  form.dispatchEvent(
    new first.dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await wait(
    () =>
      first.root.querySelector("[data-select-plan]")?.textContent ===
      "Gem rejse og importér bilag",
  );
  assert.equal((await store.list()).length, 0);
  assert.match(first.root.querySelector("#result").textContent, /billet.pdf/);
  first.root.querySelector("[data-edit-details]").click();
  first.root.querySelector(".journey-details-editor select").value = "30";
  first.root.querySelector("[data-save-details]").click();
  await wait(
    async () =>
      (await imports.get(record.id))?.draftPlan?.assistanceInterval === 30,
  );
  assert.equal((await store.list()).length, 0);
  const second = setup(`#import=${record.id}`);
  await wait(() => second.root.querySelector("[data-select-plan]"));
  second.root.querySelector("[data-select-plan]").click();
  await wait(async () => (await store.list()).length === 1);
  const [plan] = await store.list();
  assert.equal(plan.assistanceInterval, 30);
  assert.equal(plan.documentReferences[0].kind, "ticket");
  assert.equal(
    new TextDecoder().decode(
      (await store.getDocument(plan.documentReferences[0].id)).bytes,
    ),
    "original ticket",
  );
  await wait(async () => !(await imports.get(record.id)));
});

test("cancellation and explicit replacement confirmation leave existing documents untouched until confirmed", async () => {
  const { createJourneyStore } = await import("../src/journey-store.js");
  const { proposeJourney } = await import("../src/journey.js");
  const db = new IDBFactory();
  const store = createJourneyStore(db),
    imports = globalThis.RejseFlexImports.createStore(db);
  const plan = {
    ...(await proposeJourney({
      from: { label: "A" },
      to: { label: "B" },
      arrival: "2026-10-20T14:00",
    })),
    id: "replace-ui",
    selected: true,
    documentReferences: [{ id: "old", kind: "ticket", name: "old.pdf" }],
  };
  await store.saveDocument(plan, {
    id: "old",
    journeyId: plan.id,
    bytes: new ArrayBuffer(4),
  });
  const record = await imports.stage(new File(["new"], "new.pdf"));
  const dom = new JSDOM('<main id="app"></main>', {
    url: `https://example.test/RejseFlex/#import=${record.id}`,
  });
  const root = dom.window.document.querySelector("#app");
  mountApp(root, { journeyStore: store, importStore: imports });
  await wait(() => !root.querySelector("[data-import-targets]").hidden);
  root.querySelector("[data-import-existing]").click();
  await wait(() => root.querySelector("[data-import-journey]"));
  root.querySelector("[data-import-journey]").click();
  await wait(() => !root.querySelector("[data-import-replacement]").hidden);
  assert.equal(root.querySelector("[data-confirm-import]").disabled, true);
  assert.deepEqual((await store.list())[0], plan);
  root.querySelector("[data-cancel-import]").click();
  await wait(async () => !(await imports.get(record.id)));
  assert.deepEqual((await store.list())[0], plan);
  assert.ok(await store.getDocument("old"));
});

test("real service worker intercepts multipart POST locally and keeps the repository scope", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const handlers = {};
  let network = 0;
  const context = {
    indexedDB: new IDBFactory(),
    crypto: globalThis.crypto,
    Request,
    Response,
    URL,
    Date,
    console,
    self: {
      registration: { scope: "https://example.test/RejseFlex/" },
      location: { origin: "https://example.test" },
      addEventListener: (name, handler) => {
        handlers[name] = handler;
      },
    },
    fetch: () => {
      network++;
      throw new Error("must not upload");
    },
  };
  const core = await readFile(
    new URL("../public/import-storage.js", import.meta.url),
    "utf8",
  );
  context.importScripts = () => vm.runInNewContext(core, context);
  vm.runInNewContext(
    await readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    context,
  );
  for (const [name, mime, kind] of [
    ["plan.docx", "application/zip", "assistance"],
    ["billet.pdf", "application/pdf", "ticket"],
  ]) {
    const form = new FormData();
    form.append("documents", new File(["bytes"], name, { type: mime }));
    let response;
    handlers.fetch({
      request: new Request("https://example.test/RejseFlex/share-target", {
        method: "POST",
        body: form,
      }),
      respondWith: (value) => {
        response = value;
      },
    });
    const result = await response;
    assert.equal(result.status, 303);
    const url = new URL(result.headers.get("Location"));
    assert.equal(url.pathname, "/RejseFlex/");
    const id = new URLSearchParams(url.hash.slice(1)).get("import");
    assert.equal(
      (await context.RejseFlexImports.createStore(context.indexedDB).get(id))
        .kind,
      kind,
    );
  }
  assert.equal(network, 0);
  const manifest = JSON.parse(
    await readFile(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.share_target.method, "POST");
  assert.equal(manifest.share_target.action, "/RejseFlex/share-target");
  assert.equal(manifest.share_target.enctype, "multipart/form-data");
  assert.ok(manifest.share_target.params.files[0].accept.includes(".docx"));
  assert.ok(manifest.share_target.params.files[0].accept.includes(".pdf"));
});

test("interrupted completion resumes the committed journey without duplicating it and cleans the receipt", async () => {
  const { createJourneyStore } = await import("../src/journey-store.js");
  const { proposeJourney } = await import("../src/journey.js");
  const { importedDocument } = await import("../src/document-import.js");
  const db = new IDBFactory();
  const store = createJourneyStore(db), imports = globalThis.RejseFlexImports.createStore(db);
  const record = await imports.stage(new File(["original"], "plan.docx"));
  const plan = { ...(await proposeJourney({from:{label:"A"},to:{label:"B"},arrival:"2026-10-20T14:00"})), id:"committed",selected:true };
  await imports.put({...record,mode:"new",step:"review",draftPlan:plan});
  const saved = await store.completeImport(plan, importedDocument(record,plan.id), {create:true});
  assert.deepEqual(await store.completeImport(plan, importedDocument(record,plan.id), {create:true}),saved);
  const dom = new JSDOM('<main id="app"></main>', {url:`https://example.test/RejseFlex/#import=${record.id}`});
  const root=dom.window.document.querySelector("#app");
  mountApp(root,{journeyStore:store,importStore:imports});
  await wait(()=>root.querySelector("#result")?.textContent.includes("plan.docx"));
  assert.equal((await store.list()).length,1);
  assert.equal(await imports.get(record.id),undefined);
  assert.equal(dom.window.location.hash,"");
});

test("separate shares get distinct receipts; missing, multiple, malformed and storage failures redirect safely", async () => {
  const store=globalThis.RejseFlexImports.createStore(new IDBFactory());
  const scope="https://example.test/RejseFlex/";
  const request=(form)=>new Request(`${scope}share-target`,{method:"POST",body:form});
  const form=()=>{const value=new FormData();value.append("documents",new File(["original"],"plan.docx"));return value;};
  const results=await Promise.all([1,2].map(()=>globalThis.RejseFlexImports.receiveShare(request(form()),scope,store)));
  assert.notEqual(results[0].headers.get("Location"),results[1].headers.get("Location"));
  const multiple=form();multiple.append("documents",new File(["ticket"],"billet.pdf"));
  assert.match((await globalThis.RejseFlexImports.receiveShare(request(multiple),scope,store)).headers.get("Location"),/import-error=multiple/);
  assert.match((await globalThis.RejseFlexImports.receiveShare(request("malformed"),scope,store)).headers.get("Location"),/import-error=invalid/);
  assert.match((await globalThis.RejseFlexImports.receiveShare(request(form()),scope,{stage:async()=>{throw new Error("storage unavailable");}})).headers.get("Location"),/import-error=storage/);
});
