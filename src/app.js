import { proposeJourney, recordBookingTime, confirmBooking, confirmAssistance, confirmTrainChoice } from './journey.js';
import { createJourneyStore } from './journey-store.js';
import { renderJourney, element, placeName } from './journey-view.js';
import { bindAddressSearch } from './address-input.js';

export function mountApp(root, { geocoder, map, mapFactory, trainSource, journeyStore = createJourneyStore() } = {}) {
  const document = root.ownerDocument;
  const selected = { from: null, to: null };
  root.innerHTML = `
    <div class="site-shell">
      <header class="site-header">
        <a class="brand" href="./" aria-label="RejseFlex forside"><span class="brand-mark" aria-hidden="true">↗</span><span>RejseFlex</span></a>
        <span class="header-tag">UOFFICIEL · DEMO</span>
      </header>
      <main>
        <section class="planner-screen" aria-label="Planlæg rejse">
          <div class="planner-map" id="address-map" role="region" aria-label="Interaktivt kort over valgte steder"></div>
          <div class="planner-panel">
            <h1>Planlæg rejse</h1>
            <form id="journey-form">
              <div class="place-field"><label class="field" for="from-address">Fra</label><input id="from-address" name="from" type="text" autocomplete="off" placeholder="Adresse eller sted" role="combobox" aria-autocomplete="list" aria-controls="from-options" aria-expanded="false" required><div class="place-options" id="from-options" data-options="from" role="listbox"></div><div class="place-feedback" data-feedback="from" role="status"></div></div>
              <div class="place-field"><label class="field" for="to-address">Til</label><input id="to-address" name="to" type="text" autocomplete="off" placeholder="Adresse eller sted" role="combobox" aria-autocomplete="list" aria-controls="to-options" aria-expanded="false" required><div class="place-options" id="to-options" data-options="to" role="listbox"></div><div class="place-feedback" data-feedback="to" role="status"></div></div>
              <div class="date-time-row"><label class="field">Dato<input name="date" type="date" required></label><label class="field">Tidspunkt<input name="time" type="time" required></label></div>
              <fieldset class="time-mode"><legend>Tidspunktet gælder</legend><label><input type="radio" name="timeMode" value="departure"> Afgang</label><label><input type="radio" name="timeMode" value="arrival" checked> Ankomst</label></fieldset>
              <button class="plan-button" type="submit">Planlæg rejse <span aria-hidden="true">→</span></button>
              <button type="button" class="saved-shortcut" data-open-saved hidden>Gemte rejser →</button>
              <p class="storage-feedback" data-storage-feedback role="status" hidden></p>
              <p class="planner-note">Adressesøgning sendes til <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a>, mens du skriver. Adresser og kort bygger på <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>. Gemte rejser bliver på enheden. Togtider og regler i denne demo er illustrative.</p>
            </form>
          </div>
        </section>
        <div class="coordination-screen" hidden>
          <div class="coordination-topbar"><button type="button" data-back-to-planner>← Ret søgning</button><span>RejseFlex · Uofficiel demo</span></div>
          <section id="saved-journeys" aria-live="polite"></section>
          <section id="result" class="result" aria-live="polite" hidden></section>
        </div>
      </main>
    </div>`;
  map = map ?? mapFactory?.(root.querySelector('#address-map'));
  const savedSection = root.querySelector('#saved-journeys');
  const plannerScreen = root.querySelector('.planner-screen');
  const coordinationScreen = root.querySelector('.coordination-screen');
  function showCoordination() { plannerScreen.hidden = true; coordinationScreen.hidden = false; }
  root.querySelector('[data-open-saved]').addEventListener('click', () => { showCoordination(); root.querySelector('#result').hidden = true; });
  root.querySelector('[data-back-to-planner]').addEventListener('click', () => { plannerScreen.hidden = false; coordinationScreen.hidden = true; map?.resize?.(); });
  const showStorageError = () => {
    const message = 'Lokal lagring virker ikke lige nu. Rejsen er ikke gemt; prøv igen senere.';
    savedSection.textContent = message;
    const feedback = root.querySelector('[data-storage-feedback]');
    feedback.textContent = message;
    feedback.hidden = false;
  };
  async function showSavedJourneys() {
    try {
      const plans = await journeyStore.list();
      savedSection.replaceChildren();
      root.querySelector('[data-open-saved]').hidden = !plans.length;
      if (!plans.length) return;
      savedSection.append(element(document, 'h2', '', 'Gemte rejser'));
      for (const plan of plans) {
        const button = element(document, 'button', '', `${placeName(plan.wish.from)} → ${placeName(plan.wish.to)}`);
        button.type = 'button';
        button.dataset.openPlan = '';
        button.addEventListener('click', () => { showCoordination(); renderJourney(root, plan, saveSelected, updateBooking); });
        savedSection.append(button);
      }
    } catch { showStorageError(); }
  }
  async function saveSelected(plan) {
    const selectedPlan = { ...plan, id: plan.id ?? globalThis.crypto?.randomUUID?.() ?? `journey-${Date.now()}-${Math.random()}`, selected: true, documentReferences: plan.documentReferences ?? [] };
    try {
      await journeyStore.save(selectedPlan);
      showCoordination();
      renderJourney(root, selectedPlan, saveSelected, updateBooking);
      await showSavedJourneys();
    } catch { showStorageError(); }
  }
  async function updateBooking(plan, action, value, taskId = 'inbound') {
    try {
      const updated = action === 'time'
        ? await recordBookingTime(plan, taskId, value, { trainSource })
        : action === 'confirm-assistance' ? confirmAssistance(plan)
          : action === 'confirm-train' ? confirmTrainChoice(plan) : confirmBooking(plan, taskId);
      await journeyStore.save(updated);
      showCoordination();
      renderJourney(root, updated, saveSelected, updateBooking);
      await showSavedJourneys();
    } catch (error) {
      savedSection.textContent = error.message?.includes('lagring') ? error.message : `Ændringen kunne ikke gemmes. ${error.message ?? 'Prøv igen.'}`;
    }
  }
  void showSavedJourneys();
  bindAddressSearch(root, selected, geocoder, map);
  root.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (geocoder && (!selected.from || !selected.to)) {
      for (const field of ['from', 'to']) if (!selected[field]) root.querySelector(`[data-feedback="${field}"]`).textContent = 'Find og vælg en adresse før du fortsætter.';
      return;
    }
    const wish = {
      from: selected.from ?? { label: form.elements.from.value.trim(), coordinates: null },
      to: selected.to ?? { label: form.elements.to.value.trim(), coordinates: null },
      timeMode: form.elements.timeMode.value,
      [form.elements.timeMode.value]: `${form.elements.date.value}T${form.elements.time.value}`,
    };
    try {
      const plan = await proposeJourney(wish, { trainSource });
      if (plan.kind === 'no-train') {
        const result = root.querySelector('#result');
        showCoordination();
        result.hidden = false;
        result.textContent = plan.message;
      } else { showCoordination(); renderJourney(root, plan, saveSelected, updateBooking); }
    } catch {
      const result = root.querySelector('#result');
      showCoordination();
      result.hidden = false;
      result.textContent = 'Demotogkilden virker ikke lige nu. Prøv igen senere.';
    }
  });
}
