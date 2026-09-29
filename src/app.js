import { proposeJourney, recordBookingTime, confirmBooking, confirmAssistance, confirmTrainChoice } from './journey.js';
import { createJourneyStore } from './journey-store.js';

function demoTime(value) {
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(value));
}

function placeName(place) { return place.label ?? place.name; }
function operatorName(operator) { return typeof operator === 'string' ? operator : operator?.kind === 'unknown' ? 'ukendt' : operator?.name ?? 'ukendt'; }
function assistanceFact(fact) {
  if (fact?.kind !== 'known') return 'ukendt';
  return `${fact.value} (kilde: ${fact.source ?? 'ukendt'}, sidst verificeret: ${fact.lastVerified ?? 'ukendt'})`;
}

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderJourney(root, plan, onSelect, onUpdate) {
  const { wish } = plan;
  const document = root.ownerDocument;
  const result = root.querySelector('#result');
  result.replaceChildren();
  result.hidden = false;

  const heading = element(document, 'div', 'result-heading');
  const titleBlock = element(document, 'div');
  titleBlock.append(
    element(document, 'span', 'eyebrow', 'DEMOREJSE · IKKE TIL VIRKELIG PLANLÆGNING'),
    element(document, 'h2', '', 'Din rejse i fire dele'),
  );
  heading.append(titleBlock, element(document, 'span', 'demo-stamp', 'DEMO'));
  result.append(heading);

  const summary = element(document, 'p', 'journey-summary');
  summary.append(
    element(document, 'strong', '', placeName(wish.from)),
    document.createTextNode('  →  '),
    element(document, 'strong', '', placeName(wish.to)),
  );
  result.append(summary);
  const arrival = new Date(wish.arrival);
  const dateText = new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'long', timeStyle: 'short',
  }).format(arrival);
  result.append(element(document, 'p', 'arrival-note', `Ønsket ankomst på destinationsadressen: ${dateText}`));
  result.append(element(document, 'p', 'provisional-note', 'Foreløbig rejseplan: Nødvendige oplysninger skal kontrolleres. DEMO: Togtiderne er illustrative. Brug ikke planen til en virkelig rejse.'));
  const uncertainties = element(document, 'section', 'journey-uncertainties');
  uncertainties.dataset.uncertainties = '';
  uncertainties.append(element(document, 'h3', '', 'Skal kontrolleres før bestilling'));
  for (const uncertainty of plan.uncertainties ?? []) {
    uncertainties.append(element(document, 'p', '', uncertainty.explanation));
  }
  result.append(uncertainties);
  if (plan.conflicts?.length) {
    const conflicts = element(document, 'section', 'journey-conflicts');
    conflicts.dataset.conflicts = '';
    conflicts.append(element(document, 'h3', '', 'Tiderne passer ikke sammen'));
    for (const conflict of plan.conflicts) conflicts.append(element(document, 'p', '', `${conflict.explanation} Berørte trin: ${conflict.taskIds.join(', ')}.`));
    result.append(conflicts);
  }
  const ruleNotes = element(document, 'section', 'journey-rules');
  ruleNotes.dataset.appliedRules = '';
  for (const rule of plan.appliedRules ?? []) {
    ruleNotes.append(element(document, 'p', '', `${rule.explanation} Kilde: ${rule.source}. Sidst verificeret: ${rule.lastVerified}.`));
  }
  result.append(ruleNotes);

  const action = element(document, 'section', 'next-action');
  action.dataset.nextAction = '';
  action.append(element(document, 'span', 'eyebrow', 'NÆSTE HANDLING · DEMO'), element(document, 'h3', '', plan.nextAction.title), element(document, 'p', '', plan.nextAction.explanation));
  result.append(action);

  const cards = element(document, 'div', 'journey-cards');
  const [first, train, last] = plan.legs;
  const assistance = plan.tasks.find((task) => task.id === 'assistance');
  const sections = [
    { title: 'Handicapkørsel', eyebrow: '1 · Til afgangsstationen', detail: `${placeName(first.from)} → ${first.to.name}. Trafikselskab: ${operatorName(first.operator)}. Tid, bookingkanal og pris ukendt.`, status: plan.tasks.find((task) => task.id === 'outbound').status },
    { title: 'Tog', eyebrow: '2 · Mellem stationer', detail: `${train.fromStation.name} → ${train.toStation.name}. DEMO afgang ${demoTime(train.plannedDeparture)}, ankomst ${demoTime(train.plannedArrival)}.`, status: plan.tasks.find((task) => task.id === 'train').status },
    { title: 'Handicapservice', eyebrow: '3 · Assistance ved toget', detail: `Knyttet til DEMO-tog ${assistance.trainId} ved stationerne ${assistance.stationIds?.join(' → ') ?? 'ukendt'}. Frist: ${assistanceFact(assistance.bookingDeadline)}. Mødetid: ${assistanceFact(assistance.meetingTime)}.`, status: assistance.status },
    { title: 'Handicapkørsel', eyebrow: '4 · Til destinationen', detail: `${last.from.name} → ${placeName(last.to)}. Trafikselskab: ${operatorName(last.operator)}. Tid, bookingkanal og pris ukendt.`, status: plan.tasks.find((task) => task.id === 'inbound').status },
  ];
  for (const section of sections) {
    const card = element(document, 'article', 'journey-card');
    card.dataset.journeySection = '';
    card.append(
      element(document, 'span', 'card-step', section.eyebrow),
      element(document, 'h3', '', section.title),
      element(document, 'p', '', section.detail),
      element(document, 'span', 'card-status', section.status),
    );
    cards.append(card);
  }
  result.append(cards);
  if (!plan.selected) {
    const choose = element(document, 'button', 'select-plan', 'Vælg denne demorejse');
    choose.type = 'button';
    choose.dataset.selectPlan = '';
    choose.addEventListener('click', () => onSelect(plan));
    result.append(choose);
  } else {
    result.append(element(document, 'p', 'selection-note', 'Demorejse valgt og gemt på denne enhed.'));
    for (const [taskId, title, timeLabel, dataSuffix] of [
      ['inbound', 'Sidste handicapkørsel', 'Faktisk oplyst afhentningstid', ''],
      ['outbound', 'Første handicapkørsel', 'Faktisk oplyst afhentningstid', 'Outbound'],
    ]) {
      const task = plan.tasks.find((item) => item.id === taskId);
      const booking = element(document, 'section', 'booking-entry');
      booking.append(element(document, 'h3', '', title));
      if (task.confirmed) booking.append(element(document, 'p', '', `Bekræftet ekstern bestilling. Oplyst afhentning: ${demoTime(task.actualBookingTime)}. Aftalen ændres ikke automatisk.`));
      else if (task.status === 'ikke klar') booking.append(element(document, 'p', '', 'Afventer tidligere trin i bookingforløbet.'));
      else {
        const label = element(document, 'label', '', timeLabel);
        const input = element(document, 'input');
        input.type = 'datetime-local'; input.dataset[`bookingTime${dataSuffix}`] = '';
        input.value = task.actualBookingTime?.slice(0, 16) ?? '';
        label.append(input); booking.append(label);
        const record = element(document, 'button', '', 'Registrér oplyst tid');
        record.type = 'button'; record.dataset[`recordTime${dataSuffix}`] = '';
        record.addEventListener('click', () => { if (input.value) void onUpdate(plan, 'time', input.value, taskId); });
        booking.append(record);
        if (task.actualBookingTime) {
          const confirm = element(document, 'button', '', 'Bekræft ekstern bestilling');
          confirm.type = 'button'; confirm.dataset[`confirmBooking${dataSuffix}`] = '';
          confirm.addEventListener('click', () => void onUpdate(plan, 'confirm', undefined, taskId));
          booking.append(confirm);
        }
      }
      result.append(booking);
    }
    const trainTask = plan.tasks.find((task) => task.id === 'train');
    const trainSection = element(document, 'section', 'booking-entry');
    trainSection.append(element(document, 'h3', '', 'Togforslag'));
    if (trainTask.status === 'klar til booking') {
      const confirm = element(document, 'button', '', 'Markér togforslaget som kontrolleret');
      confirm.type = 'button'; confirm.dataset.confirmTrain = '';
      confirm.addEventListener('click', () => void onUpdate(plan, 'confirm-train'));
      trainSection.append(confirm);
    } else trainSection.append(element(document, 'p', '', trainTask.status === 'færdig' ? 'Togforslaget er markeret som kontrolleret. DEMO-tider skal stadig kontrolleres eksternt.' : 'Afventer sidste handicapkørsel.'));
    result.append(trainSection);
    const assistanceSection = element(document, 'section', 'booking-entry');
    assistanceSection.dataset.assistanceTask = '';
    assistanceSection.append(element(document, 'h3', '', 'Handicapservice'));
    const confirmedTrain = assistance.trainIdentity;
    assistanceSection.append(element(document, 'p', '', `Tog ${assistance.trainId}; stationer ${assistance.stationIds?.join(' → ') ?? 'ukendt'}. Afgang: ${confirmedTrain ? demoTime(confirmedTrain.plannedDeparture) : 'ukendt'}; ankomst: ${confirmedTrain ? demoTime(confirmedTrain.plannedArrival) : 'ukendt'}. Frist: ${assistanceFact(assistance.bookingDeadline)}. Mødetid: ${assistanceFact(assistance.meetingTime)}.`));
    for (const tip of assistance.tips ?? []) assistanceSection.append(element(document, 'p', '', `${tip.text} Kilde: ${tip.source ?? 'ukendt'}. Sidst verificeret: ${tip.lastVerified ?? 'ukendt'}.`));
    if (assistance.confirmed) assistanceSection.append(element(document, 'p', '', 'Bekræftet ekstern Handicapservice-bestilling. Aftalen ændres ikke automatisk.'));
    else if (assistance.status === 'klar til booking') {
      const confirm = element(document, 'button', '', 'Bekræft ekstern Handicapservice-bestilling');
      confirm.type = 'button'; confirm.dataset.confirmAssistance = '';
      confirm.addEventListener('click', () => void onUpdate(plan, 'confirm-assistance'));
      assistanceSection.append(confirm);
    } else assistanceSection.append(element(document, 'p', '', 'Afventer kontrolleret togforslag.'));
    result.append(assistanceSection);
  }
  result.append(element(document, 'p', 'booking-note', 'RejseFlex bestiller ikke handicapkørsel, Handicapservice eller billetter.'));
  result.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

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
  for (const field of ['from', 'to']) {
    const input = root.querySelector(`[name="${field}"]`);
    const feedback = root.querySelector(`[data-feedback="${field}"]`);
    const options = root.querySelector(`[data-options="${field}"]`);
    input.addEventListener('input', () => {
      selected[field] = null;
      options.replaceChildren();
      feedback.textContent = '';
      map?.show(Object.values(selected).filter(Boolean));
    });
    root.querySelector(`[data-search="${field}"]`).addEventListener('click', async () => {
      const query = input.value.trim();
      if (!query) { feedback.textContent = 'Skriv en adresse eller et sted først.'; return; }
      const button = root.querySelector(`[data-search="${field}"]`);
      button.disabled = true;
      feedback.textContent = 'Søger efter adresser…';
      options.replaceChildren();
      try {
        const places = await geocoder.search(query);
        if (input.value.trim() !== query) return;
        if (!places.length) feedback.textContent = 'Ingen adresser fundet. Prøv et mere præcist sted eller en anden stavemåde.';
        else {
          feedback.textContent = 'Vælg den rigtige adresse:';
          for (const place of places) {
            const option = element(document, 'button', 'place-option', place.label);
            option.type = 'button';
            option.dataset.placeOption = field;
            option.addEventListener('click', () => {
              selected[field] = place;
              input.value = place.label;
              options.replaceChildren();
              feedback.textContent = `Valgt: ${place.label}`;
              map?.show(Object.values(selected).filter(Boolean));
            });
            options.append(option);
          }
        }
      } catch {
        feedback.textContent = 'Adresseopslag virker ikke lige nu. Prøv igen senere.';
      } finally { button.disabled = false; }
    });
  }
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
