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
        <span class="header-tag">UOFFICIEL GUIDE · DEMO</span>
      </header>
      <main>
        <section class="hero" aria-labelledby="page-title">
          <div class="hero-copy">
            <span class="eyebrow">DIN REJSE. ÉT SKRIDT AD GANGEN.</span>
            <h1 id="page-title">En enklere vej<br><em>fra dør til dør.</em></h1>
            <p class="hero-lead">Planlæg overblikket over handicapkørsel, tog og assistance på ét sted.</p>
            <p class="demo-disclaimer"><strong>Dette er en demo.</strong> Den viser ingen virkelige afgange eller bookingmuligheder.</p>
          </div>
          <div class="hero-visual" aria-hidden="true">
            <div class="route-line"><span class="route-dot"></span><span class="route-dot route-dot-middle"></span><span class="route-dot"></span></div>
            <div class="route-label route-label-start">HJEMMEFRA</div>
            <div class="route-label route-label-train">MED TOG</div>
            <div class="route-label route-label-end">FREMME</div>
            <div class="visual-caption">EN SAMMENHÆNGENDE REJSE</div>
          </div>
        </section>
        <section class="planning" aria-labelledby="planning-title">
          <div class="planning-intro"><span class="eyebrow">BEGYND HER</span><h2 id="planning-title">Hvor skal du hen?</h2><p>Fortæl os, hvor rejsen begynder, og hvornår du vil være fremme.</p></div>
          <form id="journey-form">
            <div class="field-row">
              <div class="place-field"><label class="field"><span>Fra</span><input name="from" type="text" autocomplete="street-address" placeholder="Adresse eller sted" required></label><button type="button" data-search="from">Find adresse</button><div class="place-feedback" data-feedback="from" role="status"></div><div class="place-options" data-options="from"></div></div>
              <div class="place-field"><label class="field"><span>Til</span><input name="to" type="text" autocomplete="off" placeholder="Adresse eller sted" required></label><button type="button" data-search="to">Find adresse</button><div class="place-feedback" data-feedback="to" role="status"></div><div class="place-options" data-options="to"></div></div>
            </div>
            <label class="field arrival-field"><span>Ønsket ankomst på destinationsadressen</span><input name="arrival" type="datetime-local" required></label>
            <p class="search-disclosure">Kun den aktuelle søgetekst sendes til en ekstern adressetjeneste (OpenStreetMap Nominatim), når du trykker Find adresse. Gemte rejser sendes ikke.</p>
            <div class="map-panel"><div id="address-map" role="img" aria-label="Kort over valgte steder"></div><p>Kortdata © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></p></div>
            <div class="form-footer"><p><strong>Demo:</strong> Adresserne er virkelige opslag, men rejsekæden og dens togtider er illustrative og kan ikke bruges til en virkelig rejse.</p><button type="submit">Vis demorejse <span aria-hidden="true">→</span></button></div>
          </form>
        </section>
        <section id="saved-journeys" aria-live="polite"></section>
        <section id="result" class="result" aria-live="polite" hidden></section>
      </main>
      <footer><span>RejseFlex · Uofficiel rejseguide</span><span>Ingen booking foretages i appen</span></footer>
    </div>`;
  map = map ?? mapFactory?.(root.querySelector('#address-map'));
  const savedSection = root.querySelector('#saved-journeys');
  const showStorageError = () => {
    savedSection.textContent = 'Lokal lagring virker ikke lige nu. Rejsen er ikke gemt; prøv igen senere.';
  };
  async function showSavedJourneys() {
    try {
      const plans = await journeyStore.list();
      savedSection.replaceChildren();
      if (!plans.length) return;
      savedSection.append(element(document, 'h2', '', 'Gemte rejser'));
      for (const plan of plans) {
        const button = element(document, 'button', '', `${placeName(plan.wish.from)} → ${placeName(plan.wish.to)}`);
        button.type = 'button';
        button.dataset.openPlan = '';
        button.addEventListener('click', () => renderJourney(root, plan, saveSelected, updateBooking));
        savedSection.append(button);
      }
    } catch { showStorageError(); }
  }
  async function saveSelected(plan) {
    const selectedPlan = { ...plan, id: plan.id ?? globalThis.crypto?.randomUUID?.() ?? `journey-${Date.now()}-${Math.random()}`, selected: true, documentReferences: plan.documentReferences ?? [] };
    try {
      await journeyStore.save(selectedPlan);
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
      arrival: form.elements.arrival.value,
    };
    try {
      const plan = await proposeJourney(wish, { trainSource });
      if (plan.kind === 'no-train') {
        const result = root.querySelector('#result');
        result.hidden = false;
        result.textContent = plan.message;
      } else renderJourney(root, plan, saveSelected, updateBooking);
    } catch {
      const result = root.querySelector('#result');
      result.hidden = false;
      result.textContent = 'Demotogkilden virker ikke lige nu. Prøv igen senere.';
    }
  });
}
