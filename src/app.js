const sections = [
  { title: 'Handicapkørsel', eyebrow: '1 · Til afgangsstationen', detail: 'Tid og trafikselskab er endnu ikke beregnet.' },
  { title: 'Tog', eyebrow: '2 · Mellem stationer', detail: 'Afgang og ankomst er endnu ikke beregnet.' },
  { title: 'Handicapservice', eyebrow: '3 · Assistance ved toget', detail: 'Behov og mødetid skal kontrolleres ved en rigtig rejse.' },
  { title: 'Handicapkørsel', eyebrow: '4 · Til destinationen', detail: 'Afhentning og ankomst er endnu ikke beregnet.' },
];

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderJourney(root, wish) {
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
    element(document, 'strong', '', wish.from),
    document.createTextNode('  →  '),
    element(document, 'strong', '', wish.to),
  );
  result.append(summary);
  const arrival = new Date(wish.arrival);
  const dateText = new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'long', timeStyle: 'short',
  }).format(arrival);
  result.append(element(document, 'p', 'arrival-note', `Ønsket ankomst på destinationsadressen: ${dateText}`));
  result.append(element(document, 'p', 'provisional-note', 'Foreløbig demo: Ingen tider, stationer eller bookingregler er verificeret. Brug ikke planen til en virkelig rejse.'));

  const cards = element(document, 'div', 'journey-cards');
  for (const section of sections) {
    const card = element(document, 'article', 'journey-card');
    card.dataset.journeySection = '';
    card.append(
      element(document, 'span', 'card-step', section.eyebrow),
      element(document, 'h3', '', section.title),
      element(document, 'p', '', section.detail),
      element(document, 'span', 'card-status', 'Afventer planlægning'),
    );
    cards.append(card);
  }
  result.append(cards);
  result.append(element(document, 'p', 'booking-note', 'RejseFlex bestiller ikke handicapkørsel, Handicapservice eller billetter.'));
  result.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export function mountApp(root) {
  const document = root.ownerDocument;
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
              <label class="field"><span>Fra</span><input name="from" type="text" autocomplete="street-address" placeholder="Adresse eller sted" required></label>
              <label class="field"><span>Til</span><input name="to" type="text" autocomplete="off" placeholder="Adresse eller sted" required></label>
            </div>
            <label class="field arrival-field"><span>Ønsket ankomst på destinationsadressen</span><input name="arrival" type="datetime-local" required></label>
            <div class="form-footer"><p><strong>Demo:</strong> Du kan skrive vilkårlige steder. Der foretages endnu ikke adresseopslag eller beregning.</p><button type="submit">Vis demorejse <span aria-hidden="true">→</span></button></div>
          </form>
        </section>
        <section id="result" class="result" aria-live="polite" hidden></section>
      </main>
      <footer><span>RejseFlex · Uofficiel rejseguide</span><span>Ingen booking foretages i appen</span></footer>
    </div>`;
  root.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    renderJourney(root, {
      from: form.elements.from.value.trim(),
      to: form.elements.to.value.trim(),
      arrival: form.elements.arrival.value,
    });
  });
}
