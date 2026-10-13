import "../public/import-storage.js";
import { element, placeName } from "./journey-view.js";
import { withDocumentReference } from "./documents.js";
export const createImportStore = globalThis.RejseFlexImports.createStore;
export function importedDocument(record, journeyId) {
  return {
    id: `import-${record.id}`,
    journeyId,
    kind: record.kind,
    name: record.name,
    mime: record.mime,
    bytes: record.bytes,
    updatedAt: new Date().toISOString(),
  };
}
export function bindDocumentImport(
  root,
  { journeyStore, importStore = createImportStore(), showPlanner, showJourney },
) {
  const document = root.ownerDocument,
    window = document.defaultView;
  const screen = root.querySelector(".import-screen"),
    banner = root.querySelector("[data-pending-import]");
  let pending = null,
    selectedPlan = null,
    previousId = null,
    generation = 0,
    busy = false;
  const error = (message) => {
    screen.querySelector("[data-import-error]").textContent = message;
  };
  const failureMessage = (reason, fallback) =>
    reason?.name === "Error" ? reason.message : fallback;
  const category = (record) =>
    record.kind === "assistance" ? "Rejseplan" : "Kørestolspladsbillet";
  const route = (id) =>
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${id ? `#import=${encodeURIComponent(id)}` : ""}`,
    );
  const hide = () => {
    screen.hidden = true;
  };
  function showScreen() {
    root.querySelector(".planner-screen").hidden = true;
    root.querySelector(".coordination-screen").hidden = true;
    screen.hidden = false;
    screen.querySelector("h1").focus();
  }
  function paint() {
    screen.querySelector("[data-import-name]").textContent =
      pending?.name ?? "Intet bilag valgt";
    screen.querySelector("[data-import-kind]").textContent = pending
      ? category(pending)
      : "DOCX-rejseplan eller PDF-billet · højst 20 MB";
    screen.querySelector("[data-import-targets]").hidden = !pending;
    screen.querySelector("[data-confirm-import]").disabled =
      busy ||
      !selectedPlan ||
      (previousId && !screen.querySelector("[data-import-replace]").checked);
    screen.querySelector("[data-confirm-import]").textContent = previousId
      ? "Erstat og importér bilag"
      : "Importér bilag";
    screen.querySelector("[data-import-replacement]").hidden = !previousId;
    screen.querySelector("[data-import-replace-text]").textContent = previousId
      ? `Erstat den eksisterende ${category(pending).toLowerCase()}: ${selectedPlan.documentReferences.find((ref) => ref.id === previousId)?.name ?? "bilag"}`
      : "";
    banner.hidden = !(pending?.mode === "new");
    banner.querySelector("[data-pending-import-name]").textContent = pending
      ? `${category(pending)} · ${pending.name}`
      : "";
  }
  const resetSelection = () => {
    selectedPlan = null;
    previousId = null;
    screen.querySelector("[data-import-replace]").checked = false;
    screen.querySelector("[data-import-journeys]").replaceChildren();
    screen.querySelector("[data-import-selection]").textContent = "";
    paint();
  };
  async function remember(changes) {
    const next = { ...pending, ...changes };
    await importStore.put(next);
    pending = next;
    paint();
  }
  async function clean(record) {
    await importStore.remove(record.id);
    if (pending?.id === record.id) pending = null;
    selectedPlan = null;
    previousId = null;
    route(null);
    paint();
  }
  async function recover(record) {
    const saved = await journeyStore.getDocument?.(`import-${record.id}`);
    if (!saved) return false;
    const plan = (await journeyStore.list()).find(
      (item) => item.id === saved.journeyId,
    );
    if (!plan) return false;
    await clean(record);
    hide();
    showJourney(plan);
    return true;
  }
  async function chooseJourney(id) {
    selectedPlan = (await journeyStore.list()).find((plan) => plan.id === id);
    if (!selectedPlan)
      throw new Error("Rejsen findes ikke længere. Vælg en anden.");
    previousId =
      selectedPlan.documentReferences?.find((ref) => ref.kind === pending.kind)
        ?.id ?? null;
    screen.querySelector("[data-import-replace]").checked = false;
    await remember({ mode: "existing", planId: id, step: "choose" });
    screen
      .querySelectorAll("[data-import-journey]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.importJourney === id),
        ),
      );
    screen.querySelector("[data-import-selection]").textContent =
      `Valgt: ${placeName(selectedPlan.wish.from)} → ${placeName(selectedPlan.wish.to)}`;
    paint();
  }
  async function existing() {
    if (!pending) return;
    error("");
    const plans = await journeyStore.list();
    const list = screen.querySelector("[data-import-journeys]");
    list.replaceChildren();
    for (const plan of plans) {
      const button = element(
        document,
        "button",
        "secondary-button",
        `${placeName(plan.wish.from)} → ${placeName(plan.wish.to)}`,
      );
      button.type = "button";
      button.dataset.importJourney = plan.id;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener(
        "click",
        () => void run(() => chooseJourney(plan.id)),
      );
      list.append(button);
    }
    if (!plans.length)
      list.append(
        element(
          document,
          "p",
          "muted",
          "Du har ingen gemte rejser endnu. Vælg Opret ny rejse.",
        ),
      );
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    screen
      .querySelectorAll("button,input")
      .forEach((control) => (control.disabled = true));
    try {
      await action();
    } catch (reason) {
      error(failureMessage(reason, "Importen kunne ikke gemmes lokalt. Prøv igen."));
    } finally {
      busy = false;
      screen
        .querySelectorAll("button,input")
        .forEach((control) => (control.disabled = false));
      paint();
    }
  }
  async function begin(file) {
    const version = ++generation;
    error("");
    try {
      const record = await importStore.stage(file);
      if (version !== generation) {
        await importStore.remove(record.id);
        return;
      }
      const old = pending;
      pending = record;
      route(record.id);
      resetSelection();
      showScreen();
      if (old) await importStore.remove(old.id);
    } catch (reason) {
      if (version === generation)
        error(failureMessage(reason, "Filen kunne ikke gemmes lokalt. Vælg den igen."));
    }
  }
  async function cancel() {
    generation++;
    if (pending) await clean(pending);
    resetSelection();
    hide();
    banner.hidden = true;
    showPlanner();
  }
  async function newJourney() {
    if (!pending) return;
    await remember({ mode: "new", step: "planning", draftPlan: null });
    resetSelection();
    hide();
    showPlanner();
  }
  function hasNew(plan) {
    return pending?.mode === "new" && !!pending.draftPlan && pending.draftPlan.id === plan?.id;
  }
  async function stagePlan(plan) {
    if (pending?.mode !== "new") return plan;
    const draft = {
      ...plan,
      id: plan.id ?? globalThis.crypto.randomUUID(),
      selected: false,
    };
    const attached = withDocumentReference(
      draft,
      pending.kind,
      importedDocument(pending, draft.id),
    );
    await remember({ draftPlan: attached, step: "review" });
    return attached;
  }
  async function completeNew(plan, changes = []) {
    const record = pending,
      doc = importedDocument(record, plan.id);
    // The draft reference is a preview, not a previously saved document.
    const cleanPlan = {
      ...plan,
      documentReferences: (plan.documentReferences ?? []).filter(
        (ref) => ref.id !== doc.id,
      ),
    };
    // The user may have deliberately removed/replaced the imported preview in screen 2.
    const keepImported = plan.documentReferences?.some(ref => ref.id === doc.id);
    const saved = keepImported
      ? await journeyStore.completeImport(cleanPlan, doc, { create: true, changes })
      : (await journeyStore.saveDocuments(plan, changes), plan);
    pending = { ...record, mode: "completed" };
    try {
      await clean(record);
    } catch {
      error(
        "Bilaget er gemt, men den midlertidige fil kunne ikke ryddes. Åbn importen igen for at afslutte.",
      );
    }
    hide();
    return saved;
  }
  root.querySelectorAll("[data-open-import]").forEach((button) =>
    button.addEventListener("click", () => {
      error("");
      showScreen();
      paint();
    }),
  );
  screen
    .querySelector("[data-import-file]")
    .addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void begin(file);
    });
  screen
    .querySelector("[data-import-new]")
    .addEventListener("click", () => void run(newJourney));
  screen
    .querySelector("[data-import-existing]")
    .addEventListener("click", () => void run(existing));
  screen
    .querySelector("[data-import-replace]")
    .addEventListener("change", paint);
  screen.querySelector("[data-confirm-import]").addEventListener(
    "click",
    () =>
      void run(async () => {
        if (!pending || !selectedPlan) throw new Error("Vælg en rejse først.");
        if (
          previousId &&
          !screen.querySelector("[data-import-replace]").checked
        )
          throw new Error("Bekræft, at det eksisterende bilag må erstattes.");
        const record = pending;
        const saved = await journeyStore.completeImport(
          selectedPlan,
          importedDocument(record, selectedPlan.id),
          { expectedDocumentId: previousId },
        );
        await clean(record);
        hide();
        showJourney(saved);
      }),
  );
  screen
    .querySelector("[data-cancel-import]")
    .addEventListener("click", () => void run(cancel));
  banner
    .querySelector("[data-cancel-pending-import]")
    .addEventListener("click", () => void run(cancel));
  const ready = (async () => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const id = params.get("import");
    if (params.has("import-error")) {
      const messages = {
        missing: "Ingen fil blev modtaget.",
        multiple: "Del ét bilag ad gangen.",
        type: "Vælg en DOCX-rejseplan eller en PDF-billet med en entydig filtype.",
        size: "Bilaget skal være mellem 1 byte og 20 MB.",
        storage:
          "Bilaget kunne ikke modtages eller gemmes lokalt. Vælg filen igen.",
        invalid: "Den delte fil kunne ikke modtages.",
      };
      showScreen();
      error(
        messages[params.get("import-error")] ??
          "Bilaget kunne ikke modtages. Vælg filen igen.",
      );
      return;
    }
    if (!id) return;
    try {
      pending = await importStore.get(id);
      if (!pending) {
        showScreen();
        error("Importen findes ikke længere. Vælg bilaget igen.");
        return;
      }
      if (await recover(pending)) return;
      paint();
      if (pending.mode === "new") {
        hide();
        if (pending.step === "review" && pending.draftPlan)
          showJourney(pending.draftPlan);
        else showPlanner();
      } else {
        showScreen();
        if (pending.planId) {
          await existing();
          await chooseJourney(pending.planId);
        }
      }
    } catch {
      showScreen();
      error("Importen kunne ikke åbnes fra lokal lagring. Prøv igen.");
    }
  })();
  return {
    ready,
    hasNew,
    stagePlan,
    completeNew,
    pendingDocument: (plan, id) =>
      hasNew(plan) && id === `import-${pending.id}`
        ? importedDocument(pending, plan.id)
        : null,
    decorate() {
      if (
        hasNew(pending?.draftPlan) &&
        root.querySelector("[data-select-plan]")
      )
        root.querySelector("[data-select-plan]").textContent =
          "Gem og vis rejseoverblik";
    },
    async back() {
      if (pending?.mode === "new") await remember({ step: "planning" });
    },
  };
}
