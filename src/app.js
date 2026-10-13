import { bindDocumentImport } from "./document-import.js";
import {
  withManualPrice,
  withMeetingInterval,
  copenhagenInstant,
} from "./journey-details.js";
import {
  prepareDocument,
  withDocumentReference,
  openDocument,
  downloadDocument,
} from "./documents.js";
import { stationSelect } from "./station-select.js";
import { exampleStations } from "./stations.js";
import {
  proposeJourney,
  recordBookingTime,
  editBookingTime,
  withSelfTransport,
  confirmBooking,
  confirmAssistance,
  confirmTrainChoice,
} from "./journey.js";
import { createJourneyStore } from "./journey-store.js";
import { renderJourney, element, placeName } from "./journey-view.js";
import { bindAddressSearch } from "./address-input.js";

export function mountApp(
  root,
  {
    geocoder,
    map,
    mapFactory,
    trainSource,
    trafficAreaSource,
    roadDistanceSource,
    journeyStore = createJourneyStore(),
    importStore,
  } = {},
) {
  const document = root.ownerDocument;
  const selected = { from: null, to: null };
  const stations = { from: null, to: null };
  let currentPlan;
  let importFlow;
  const showPlan = (plan) => {
    currentPlan = { ...plan, id: plan.id ?? globalThis.crypto.randomUUID() };
    renderJourney(root, currentPlan, saveSelected, updateBooking);
    importFlow?.decorate();
    const list = root.querySelector("#saved-journeys details");
    if (list) list.open = false;
  };
  root.innerHTML = `
    <div class="site-shell">
      <main>
        <section class="planner-screen" aria-label="Planlæg rejse">
          <div class="planner-map" id="address-map" role="region" aria-label="Interaktivt kort over valgte steder"></div>
          <div class="planner-panel">
            <a class="brand" href="./" aria-label="RejseFlex forside"><span class="brand-mark" aria-hidden="true">↗</span><span>RejseFlex</span></a>
            <span class="eyebrow">DIN REJSE, TRIN FOR TRIN</span>
            <h1>Planlæg rejse</h1>
            <p class="planner-intro">Få overblik over handicapkørsel, tog og assistance på din rejse.</p><p class="planner-demo">Demo · illustrative togtider</p>
            <form id="journey-form">
              <div class="place-field"><label class="field" for="from-address">Fra</label><input id="from-address" name="from" type="text" autocomplete="off" placeholder="Adresse eller sted" role="combobox" aria-autocomplete="list" aria-controls="from-options" aria-expanded="false" required><div class="place-options" id="from-options" data-options="from" role="listbox"></div><div class="place-feedback" data-feedback="from" role="status"></div></div>
              <div class="place-field"><label class="field" for="to-address">Til</label><input id="to-address" name="to" type="text" autocomplete="off" placeholder="Adresse eller sted" role="combobox" aria-autocomplete="list" aria-controls="to-options" aria-expanded="false" required><div class="place-options" id="to-options" data-options="to" role="listbox"></div><div class="place-feedback" data-feedback="to" role="status"></div></div>
              <label class="field" for="handicap-provider">Trafikselskab for handicapkørsel<select id="handicap-provider" name="handicapProvider" required><option value="">Vælg dit trafikselskab</option><option value="MOVIA">Movia</option><option value="MIDTTRAFIK">Midttrafik</option><option value="FYNBUS">FynBus</option><option value="SYDTRAFIK">Sydtrafik</option><option value="NT">NT</option></select></label><div class="date-time-row"><label class="field">Dato<input name="date" type="date" required></label><label class="field">Tidspunkt<input name="time" type="time" required></label></div>
              <fieldset class="time-mode"><legend>Tidspunktet gælder</legend><label><input type="radio" name="timeMode" value="departure"> Afgang</label><label><input type="radio" name="timeMode" value="arrival" checked> Ankomst</label></fieldset>
              <details class="station-settings" open><summary>Vælg stationer selv</summary><p class="muted">Valgfrit · Ellers findes stationerne automatisk. Listen indeholder foreløbig kun eksempelstationer.</p><div data-station-selectors></div></details>
              <button class="plan-button" type="submit">Planlæg rejse <span aria-hidden="true">→</span></button>
              <button type="button" class="text-button" data-open-import>Importér rejsebilag</button>
              <div data-pending-import class="pending-import" hidden><span data-pending-import-name></span><button type="button" class="text-button" data-cancel-pending-import>Annullér import</button></div>
              <button type="button" class="saved-shortcut" data-open-saved hidden>Gemte rejser →</button>
              <p class="storage-feedback" data-storage-feedback role="status" hidden></p>
              <details class="source-disclosure"><summary>Om RejseFlex · data og privatliv</summary><p class="planner-note">Adressesøgning sendes til <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a>, mens du skriver. Adresser og kort bygger på <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>. Gemte rejser og dokumenter bliver på enheden. Dokumenter uploades aldrig til en server. Togtider i denne demo er illustrative. Geografi hentes via <a href="https://dataforsyningen.dk/" target="_blank" rel="noopener noreferrer">Dataforsyningen</a>; de valgte koordinater sendes til denne tjeneste ved planlægning.</p></details>
            </form>
          </div>
        </section>
        <div class="coordination-screen" hidden>
          <div class="coordination-topbar"><a class="brand" href="./" aria-label="RejseFlex forside"><span class="brand-mark" aria-hidden="true">↗</span><span>RejseFlex</span></a><button type="button" class="text-button" data-open-import>Importér bilag</button><button type="button" data-back-to-planner>← Ret søgning</button></div>
          <section id="saved-journeys" aria-live="polite"></section>
          <section id="result" class="result" aria-live="polite" hidden></section>
        </div>
        <section class="import-screen" aria-labelledby="import-heading" hidden>
          <div class="import-topbar"><a class="brand" href="./" aria-label="RejseFlex forside"><span class="brand-mark" aria-hidden="true">↗</span><span>RejseFlex</span></a><button type="button" class="text-button" data-cancel-import>Annullér</button></div>
          <h1 id="import-heading" tabindex="-1">Importér rejsebilag</h1>
          <p class="muted">Bilaget gemmes kun på denne enhed.</p>
          <label class="field">Vælg fil<input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-import-file></label>
          <div class="import-file-info"><strong data-import-name>Intet bilag valgt</strong><span class="muted" data-import-kind></span></div>
          <div data-import-targets hidden><div class="import-actions"><button type="button" class="secondary-button" data-import-new>Opret ny rejse</button><button type="button" class="secondary-button" data-import-existing>Tilføj til eksisterende rejse</button></div>
          <div data-import-journeys class="import-journeys"></div><p class="muted" data-import-selection></p>
          <label class="self-transport-control" data-import-replacement hidden><input type="checkbox" data-import-replace><span data-import-replace-text></span></label>
          <button type="button" class="select-plan" data-confirm-import disabled>Importér bilag</button></div>
          <p class="inline-error" role="status" data-import-error></p>
        </section>
      </main>
    </div>`;
  const showPlanner = () => {
    root.querySelector(".import-screen").hidden = true;
    root.querySelector(".planner-screen").hidden = false;
    root.querySelector(".coordination-screen").hidden = true;
    map?.resize?.();
  };
  importFlow = bindDocumentImport(root, {
    journeyStore,
    importStore,
    showPlanner,
    showJourney: (plan) => {
      root.querySelector(".import-screen").hidden = true;
      showCoordination();
      showPlan(plan);
      void showSavedJourneys();
    },
  });
  map = map ?? mapFactory?.(root.querySelector("#address-map"));
  const savedSection = root.querySelector("#saved-journeys");
  const plannerScreen = root.querySelector(".planner-screen");
  const coordinationScreen = root.querySelector(".coordination-screen");
  function showCoordination() {
    plannerScreen.hidden = true;
    coordinationScreen.hidden = false;
  }
  root.querySelector("[data-open-saved]").addEventListener("click", () => {
    showCoordination();
    root.querySelector("#result").hidden = true;
    const list = savedSection.querySelector("details");
    if (list) list.open = true;
  });
  root.querySelector("[data-back-to-planner]").addEventListener("click", () => {
    plannerScreen.hidden = false;
    coordinationScreen.hidden = true;
    map?.resize?.();
    void importFlow.back();
  });
  const showStorageError = () => {
    const message =
      "Lokal lagring virker ikke lige nu. Rejsen er ikke gemt; prøv igen senere.";
    savedSection.textContent = message;
    const feedback = root.querySelector("[data-storage-feedback]");
    feedback.textContent = message;
    feedback.hidden = false;
  };
  async function showSavedJourneys() {
    try {
      const plans = await journeyStore.list();
      savedSection.replaceChildren();
      root.querySelector("[data-open-saved]").hidden = !plans.length;
      if (!plans.length) return;
      const list = element(document, "details", "saved-list");
      list.open = root.querySelector("#result").hidden;
      list.append(
        element(document, "summary", "", `Gemte rejser (${plans.length})`),
      );
      savedSection.append(list);
      for (const plan of plans) {
        const button = element(
          document,
          "button",
          "",
          `${placeName(plan.wish.from)} → ${placeName(plan.wish.to)}`,
        );
        button.type = "button";
        button.dataset.openPlan = "";
        button.addEventListener("click", () => {
          showCoordination();
          showPlan(plan);
        });
        list.append(button);
      }
    } catch {
      showStorageError();
    }
  }
  async function saveSelected(plan) {
    const selectedPlan = {
      ...plan,
      id:
        plan.id ??
        globalThis.crypto?.randomUUID?.() ??
        `journey-${Date.now()}-${Math.random()}`,
      selected: true,
      documentReferences: plan.documentReferences ?? [],
    };
    try {
      const saved = importFlow.hasNew(plan)
        ? await importFlow.completeNew(selectedPlan)
        : (await journeyStore.save(selectedPlan), selectedPlan);
      showCoordination();
      showPlan(saved);
      await showSavedJourneys();
    } catch {
      showStorageError();
    }
  }
  let updateQueue = Promise.resolve();
  function updateBooking(plan, action, value, taskId = "inbound") {
    const update = async () => {
      const base =
        currentPlan === plan || currentPlan?.id === plan.id
          ? currentPlan
          : plan;
      if (action === "view-document" || action === "download-document") {
        const reference = base.documentReferences?.find(
          (item) => item.id === value,
        );
        const stored =
          importFlow.pendingDocument(base, value) ??
          (reference && (await journeyStore.getDocument(value)));
        if (!stored || stored.journeyId !== base.id)
          throw new Error(
            "Dokumentet findes ikke på denne enhed. Upload det igen.",
          );
        if (action === "view-document") await openDocument(document, stored);
        else downloadDocument(document, stored);
        return;
      }
      if (
        importFlow.hasNew(base) &&
        !["stations", "price", "interval", "self-transport"].includes(action)
      )
        throw new Error(
          "Gem rejsen, før du ændrer andre bilag eller bookinger.",
        );
      const saved = {
        ...base,
        id: base.id ?? globalThis.crypto.randomUUID(),
        selected: true,
      };
      let updated;
      if (action === "stations") {
        if (
          saved.tasks.some(
            (task) =>
              task.confirmed ||
              task.actualBookingTime ||
              task.status === "færdig",
          )
        )
          throw new Error(
            "Stationer kan ikke ændres her efter registrering af en aftale. Ret først aftalen hos udbyderen.",
          );
        if (!value.from || !value.to)
          throw new Error("Vælg begge stationer fra listen.");
        const proposal = await proposeJourney(
          { ...saved.wish, stations: value },
          {
            trainSource,
            trafficAreaSource,
            roadDistanceSource,
            handicapProvider: providerSelect.value,
            calculatePrices: false,
          },
        );
        if (proposal.kind !== "journey") throw new Error(proposal.message);
        updated = { ...saved, ...proposal, id: saved.id, selected: true };
        for (const id of ["outbound", "inbound"])
          if (saved.tasks.find((task) => task.id === id)?.selfManaged)
            updated = withSelfTransport(updated, id, true);
      } else if (action === "self-transport")
        updated = withSelfTransport(saved, taskId, value);
      else if (action === "price")
        updated = withManualPrice(saved, taskId, value);
      else if (action === "interval")
        updated = withMeetingInterval(saved, value);
      else if (action === "document" || action === "remove-document") {
        const previous = saved.documentReferences?.find(
          (item) => item.kind === taskId,
        );
        const file =
          action === "document"
            ? await prepareDocument(value, taskId, saved.id)
            : null;
        updated = withDocumentReference(saved, taskId, file);
        await journeyStore.saveDocument(updated, file, previous?.id);
        showPlan(updated);
        await showSavedJourneys();
        return;
      } else
        updated =
          action === "time" || action === "edit-time"
            ? await (
                action === "edit-time" ? editBookingTime : recordBookingTime
              )(saved, taskId, copenhagenInstant(value), { trainSource })
            : action === "confirm-assistance"
              ? confirmAssistance(saved)
              : action === "confirm-train"
                ? confirmTrainChoice(saved)
                : confirmBooking(saved, taskId);
      if (importFlow.hasNew(base))
        updated = await importFlow.stagePlan(updated);
      else await journeyStore.save(updated);
      showCoordination();
      showPlan(updated);
      await showSavedJourneys();
    };
    const pending = updateQueue.then(update);
    updateQueue = pending.catch(() => {});
    return pending;
  }
  for (const [key, label] of [
    ["from", "Afgangsstation"],
    ["to", "Ankomststation"],
  ]) {
    root.querySelector("[data-station-selectors]").append(
      stationSelect(document, {
        label,
        stations: exampleStations,
        onChange: (station) => {
          stations[key] = station;
        },
      }),
    );
  }
  const providerSelect = root.querySelector("#handicap-provider");
  if (journeyStore.getHandicapProvider)
    void journeyStore
      .getHandicapProvider()
      .then((value) => {
        if (value && !providerSelect.value) providerSelect.value = value;
      })
      .catch(showStorageError);
  providerSelect.addEventListener("change", () => {
    if (providerSelect.value && journeyStore.setHandicapProvider)
      void journeyStore
        .setHandicapProvider(providerSelect.value)
        .catch(showStorageError);
  });
  void showSavedJourneys();
  bindAddressSearch(root, selected, geocoder, map, journeyStore);
  root.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (geocoder && (!selected.from || !selected.to)) {
      for (const field of ["from", "to"])
        if (!selected[field])
          root.querySelector(`[data-feedback="${field}"]`).textContent =
            "Find og vælg en adresse før du fortsætter.";
      return;
    }
    const wish = {
      from: selected.from ?? {
        label: form.elements.from.value.trim(),
        coordinates: null,
      },
      to: selected.to ?? {
        label: form.elements.to.value.trim(),
        coordinates: null,
      },
      stations: { ...stations },
      timeMode: form.elements.timeMode.value,
      [form.elements.timeMode.value]:
        `${form.elements.date.value}T${form.elements.time.value}`,
    };
    try {
      const plan = await proposeJourney(wish, {
        trainSource,
        trafficAreaSource,
        roadDistanceSource,
        handicapProvider: providerSelect.value,
        calculatePrices: false,
      });
      if (plan.kind === "no-train") {
        const result = root.querySelector("#result");
        showCoordination();
        result.hidden = false;
        result.textContent = plan.message;
      } else {
        showCoordination();
        showPlan(await importFlow.stagePlan(plan));
      }
    } catch {
      const result = root.querySelector("#result");
      showCoordination();
      result.hidden = false;
      result.textContent =
        "Demotogkilden virker ikke lige nu. Prøv igen senere.";
    }
  });
}
