function demoTime(value) {
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(value));
}

export function placeName(place) { return place.label ?? place.name; }
function operatorName(operator) { return typeof operator === 'string' ? operator : operator?.kind === 'unknown' ? 'ukendt' : operator?.name ?? 'ukendt'; }
function handicapDetail(leg) {
  if (leg.priceEstimate?.kind !== 'known') return 'Pris og bookingmåde afventer vejafstand eller trafikselskab.';
  const fare = leg.priceEstimate;
  const amount = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(fare.estimatedPrice);
  const normal = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(fare.normalPrice);
  const price = fare.discountApplied ? `ca. ${amount} kr. ved onlinebestilling (normalpris ca. ${normal} kr.)` : `ca. ${amount} kr.`;
  const action = { BOOK_DIGITALLY: 'Bestil digitalt', CALL_HOME_PROVIDER: 'Ring til dit trafikselskab', CALL_FOR_CROSS_REGION_BOOKING: 'Ring om den samlede rejse', MANUAL_BOOKING_REQUIRED: 'Kontrollér bookingmåden' }[leg.handicapTrip.booking.actionType];
  return `${price} ${action}. Vejafstand ca. ${Math.round(leg.distanceKm)} km. Afhentningstid afventer bestilling.`;
}
function assistanceFact(fact) {
  if (fact?.kind !== 'known') return 'ukendt';
  return `${fact.value} (kilde: ${fact.source ?? 'ukendt'}, sidst verificeret: ${fact.lastVerified ?? 'ukendt'})`;
}

export function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderJourney(root, plan, onSelect, onUpdate) {
  const { wish } = plan;
  const document = root.ownerDocument;
  const result = root.querySelector('#result');
  result.replaceChildren();
  result.hidden = false;

  const pricedHandicap = plan.legs[0].priceEstimate?.kind === 'known' && plan.legs[2].priceEstimate?.kind === 'known';
  const heading = element(document, 'div', 'result-heading');
  const titleBlock = element(document, 'div');
  titleBlock.append(
    element(document, 'span', 'eyebrow', pricedHandicap ? 'REJSEPLAN · TOGTIDER ILLUSTRATIVE' : 'DEMOREJSE · IKKE TIL VIRKELIG PLANLÆGNING'),
    element(document, 'h2', '', 'Din rejse i fire dele'),
  );
  heading.append(titleBlock, element(document, 'span', 'demo-stamp', pricedHandicap ? 'TOG DEMO' : 'DEMO'));
  result.append(heading);

  const summary = element(document, 'p', 'journey-summary');
  summary.append(
    element(document, 'strong', '', placeName(wish.from)),
    document.createTextNode('  →  '),
    element(document, 'strong', '', placeName(wish.to)),
  );
  result.append(summary);
  const isDeparture = wish.timeMode === 'departure';
  const requestedTime = new Date(isDeparture ? wish.departure : wish.arrival);
  const dateText = new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'long', timeStyle: 'short',
  }).format(requestedTime);
  result.append(element(document, 'p', 'arrival-note', `${isDeparture ? 'Ønsket afgang fra startadressen' : 'Ønsket ankomst på destinationsadressen'}: ${dateText}`));
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
  if (plan.nextAction.actionType) action.dataset.bookingAction = plan.nextAction.actionType;
  action.append(element(document, 'span', 'eyebrow', plan.nextAction.mode === 'handicap-booking' ? 'NÆSTE HANDLING' : 'NÆSTE HANDLING · DEMO'), element(document, 'h3', '', plan.nextAction.title), element(document, 'p', '', plan.nextAction.explanation));
  if (plan.nextAction.bookingUrl) {
    const link = element(document, 'a', 'booking-link', 'Åbn trafikselskabets bestillingsinformation ↗');
    link.href = plan.nextAction.bookingUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    action.append(link);
  }
  result.insertBefore(action, uncertainties);

  const cards = element(document, 'div', 'journey-cards');
  const [first, train, last] = plan.legs;
  const assistance = plan.tasks.find((task) => task.id === 'assistance');
  const sections = [
    { title: 'Handicapkørsel', eyebrow: '1 · Til afgangsstationen', detail: `${placeName(first.from)} → ${first.to.name}. Trafikselskab: ${operatorName(first.operator)}. ${handicapDetail(first)}`, status: plan.tasks.find((task) => task.id === 'outbound').status },
    { title: 'Tog', eyebrow: '2 · Mellem stationer', detail: `${train.fromStation.name} → ${train.toStation.name}. DEMO afgang ${demoTime(train.plannedDeparture)}, ankomst ${demoTime(train.plannedArrival)}.`, status: plan.tasks.find((task) => task.id === 'train').status },
    { title: 'Handicapservice', eyebrow: '3 · Assistance ved toget', detail: `Knyttet til DEMO-tog ${assistance.trainId} ved stationerne ${assistance.stationIds?.join(' → ') ?? 'ukendt'}. Frist: ${assistanceFact(assistance.bookingDeadline)}. Mødetid: ${assistanceFact(assistance.meetingTime)}.`, status: assistance.status },
    { title: 'Handicapkørsel', eyebrow: '4 · Til destinationen', detail: `${last.from.name} → ${placeName(last.to)}. Trafikselskab: ${operatorName(last.operator)}. ${handicapDetail(last)}`, status: plan.tasks.find((task) => task.id === 'inbound').status },
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
  result.insertBefore(cards, uncertainties);
  if (!plan.selected) {
    const choose = element(document, 'button', 'select-plan', pricedHandicap ? 'Vælg denne rejse' : 'Vælg denne demorejse');
    choose.type = 'button';
    choose.dataset.selectPlan = '';
    choose.addEventListener('click', () => onSelect(plan));
    result.append(choose);
  } else {
    result.append(element(document, 'p', 'selection-note', pricedHandicap ? 'Rejse valgt og gemt på denne enhed.' : 'Demorejse valgt og gemt på denne enhed.'));
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

}

