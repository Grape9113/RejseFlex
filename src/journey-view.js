import { activeConflicts } from "./journey.js";
import {
  money,
  priceSummary,
  meetingTime,
  journeyDate,
  localDateTime,
} from "./journey-details.js";
import { renderJourneyEditor } from "./journey-editor.js";
import {
  element,
  button,
  icon,
  placeName,
  clock,
  dateLabel,
} from "./journey-ui.js";
export { element, placeName } from "./journey-ui.js";

export function renderJourney(root, plan, onSelect, onUpdate, options = {}) {
  const document = root.ownerDocument,
    result = root.querySelector("#result");
  const mode = options.mode ?? (plan.selected ? "overview" : "edit");
  result.replaceChildren();
  result.hidden = false;
  result.dataset.screen = mode;
  const task = (id) => plan.tasks.find((item) => item.id === id);
  const edit = () =>
    options.onEdit
      ? options.onEdit()
      : renderJourney(root, plan, onSelect, onUpdate, {
          ...options,
          mode: "edit",
        });
  const overview = () =>
    renderJourney(root, plan, onSelect, onUpdate, {
      ...options,
      mode: "overview",
    });
  const steps = element(document, "nav", "journey-phases");
  steps.setAttribute("aria-label", "Rejsens trin");
  for (const [number, title] of [
    [1, "Planlæg"],
    [2, "Oplysninger"],
    [3, "Overblik"],
  ]) {
    const item = element(
      document,
      "span",
      number === (mode === "edit" ? 2 : 3) ? "current" : "",
      `${number} ${title}`,
    );
    if (number === (mode === "edit" ? 2 : 3))
      item.setAttribute("aria-current", "step");
    steps.append(item);
  }
  result.append(steps);
  const header = element(
    document,
    "header",
    "journey-header compact-journey-header",
  );
  header.append(
    element(
      document,
      "h2",
      "",
      mode === "edit" ? "Udfyld rejseoplysninger" : "Rejseoverblik",
    ),
  );
  const route = element(document, "div", "journey-route-title");
  route.append(
    element(document, "span", "", placeName(plan.wish.from)),
    element(document, "span", "route-arrow", "→"),
    element(document, "strong", "", placeName(plan.wish.to)),
  );
  header.append(route);
  const date = journeyDate(plan),
    requested =
      plan.wish.timeMode === "departure"
        ? plan.wish.departure
        : plan.wish.arrival;
  header.append(
    element(
      document,
      "p",
      "journey-date",
      `${dateLabel(date)} · ${plan.wish.timeMode === "departure" ? "Ønsket afgang" : "Ønsket ankomst"} ${clock(requested)}`,
    ),
  );
  result.append(header);
  const editorHost = element(document, "div", "journey-editor-host");
  editorHost.hidden = mode !== "edit";
  result.append(editorHost);
  if (mode === "edit") {
    editorHost.append(
      renderJourneyEditor(
        document,
        plan,
        {
          onUpdate,
          onSave: (values) => onUpdate(plan, "details", values),
          onCancel: options.onCancel ?? overview,
          onRoute:
            options.onRoute ??
            (() => root.querySelector("[data-back-to-planner]")?.click()),
        },
        options.draft,
      ),
    );
    if (!plan.selected)
      editorHost.querySelector("[data-save-details]").dataset.selectPlan = "";
    result.append(
      element(
        document,
        "p",
        "demo-footnote",
        "Demo · RejseFlex bestiller ikke handicapkørsel, Handicapservice eller billetter. Kontrollér eksterne aftaler.",
      ),
    );
    return;
  }
  const actions = element(document, "div", "overview-actions");
  const editButton = button(document, "Rediger rejseoplysninger", edit);
  editButton.dataset.editDetails = "";
  actions.append(editButton);
  if (options.onRoute) {
    const routeButton = button(
      document,
      "Ret planlægning",
      () => options.onRoute(),
      "text-button",
    );
    routeButton.dataset.editRoute = "";
    actions.append(routeButton);
  }
  header.append(actions);
  const quick = element(document, "section", "journey-quick-access");
  quick.setAttribute("aria-label", "Togbillet og rejsedokumenter");
  const ticket = element(document, "div", "quick-ticket");
  ticket.append(icon(document, "ticket"));
  const ticketText = element(document, "div");
  ticketText.append(
    element(
      document,
      "strong",
      "",
      plan.ticketType === "dsb"
        ? "Togbillet: DSB"
        : plan.ticketType === "rejsekort"
          ? "Rejsekort – husk at tjekke ind"
          : "Billetform ikke angivet",
    ),
    element(
      document,
      "span",
      "muted",
      plan.ticketType === "dsb"
        ? "Billetten findes i DSB-appen"
        : plan.ticketType === "rejsekort"
          ? "Du bruger Rejsekort-appen"
          : "Kan angives under rejseoplysninger",
    ),
  );
  ticket.append(ticketText);
  ticket.dataset.ticketSummary = "";
  quick.append(ticket);
  for (const [kind, label, title] of [
    ["ticket", "Åbn pladsbillet", "Kørestolspladsbillet"],
    ["assistance", "Åbn rejseplan", "Rejseplan"],
  ]) {
    const ref = plan.documentReferences?.find((item) => item.kind === kind),
      item = element(document, "div", "quick-document");
    item.dataset.quickDocument = kind;
    if (ref) {
      const open = button(
        document,
        label,
        async () => {
          status.textContent = "";
          try {
            await onUpdate(plan, "view-document", ref.id);
          } catch (error) {
            status.textContent = error.message;
          }
        },
        "document-open secondary-button",
      );
      open.append(icon(document, "document"));
      open.dataset.openDocument = kind;
      item.append(
        open,
        element(document, "span", "document-name muted", ref.name),
      );
    } else
      item.append(
        element(document, "strong", "", title),
        element(document, "span", "muted", "Ikke tilføjet"),
      );
    quick.append(item);
  }
  const status = element(document, "p", "action-feedback");
  status.setAttribute("role", "status");
  quick.append(status);
  result.append(quick);
  const missing = [];
  if (!task("outbound").selfManaged && !task("outbound").actualBookingTime)
    missing.push("første afhentning");
  if (!plan.legs[1].plannedDeparture) missing.push("togafgang");
  if (!plan.legs[1].plannedArrival) missing.push("togankomst");
  if (!task("inbound").selfManaged && !task("inbound").actualBookingTime)
    missing.push("sidste afhentning");
  if (missing.length)
    result.append(
      element(
        document,
        "p",
        "missing-summary",
        `Ikke oplyst endnu: ${missing.join(", ")}.`,
      ),
    );
  const conflicts = activeConflicts(plan);
  if (conflicts.length) {
    const warning = element(document, "div", "journey-conflicts");
    warning.dataset.conflicts = "";
    warning.append(
      element(document, "strong", "", "Kontrollér rejseaftalerne"),
    );
    for (const conflict of conflicts)
      warning.append(element(document, "p", "", conflict.explanation));
    result.append(warning);
  }
  const events = [
    {
      id: "outbound",
      stage: "outbound",
      kind: task("outbound").selfManaged ? "self" : "car",
      time: task("outbound").selfManaged
        ? null
        : task("outbound").actualBookingTime,
      title: task("outbound").selfManaged
        ? "Selvtransport til stationen"
        : "Flextrafik · afhentning",
      description: `${placeName(plan.wish.from)} → ${placeName(plan.legs[1].fromStation)}`,
    },
    {
      id: "assistance",
      kind: "assistance",
      time: meetingTime(plan),
      title: "DSB Handicapservice",
      description: `Fremmøde ved ${placeName(plan.legs[1].fromStation)} · ${plan.assistanceInterval ?? 15} min. før toget`,
    },
    {
      id: "departure",
      stage: "train",
      kind: "train",
      time: plan.legs[1].plannedDeparture,
      title: "Togafgang",
      description: `${placeName(plan.legs[1].fromStation)} → ${placeName(plan.legs[1].toStation)}`,
    },
    {
      id: "arrival",
      kind: "train",
      time: plan.legs[1].plannedArrival,
      title: "Togankomst",
      description: `Ankomst til ${placeName(plan.legs[1].toStation)}`,
    },
    {
      id: "inbound",
      stage: "inbound",
      kind: task("inbound").selfManaged ? "self" : "car",
      time: task("inbound").selfManaged
        ? null
        : task("inbound").actualBookingTime,
      title: task("inbound").selfManaged
        ? "Selvtransport til destinationen"
        : "Flextrafik · afhentning",
      description: `${placeName(plan.legs[1].toStation)} → ${placeName(plan.wish.to)}`,
    },
  ];
  const known = events
    .filter((event) => event.time)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  let next = 0;
  const ordered = events.map((event) => (event.time ? known[next++] : event));
  const timeline = element(document, "ol", "travel-events");
  timeline.setAttribute("aria-label", "Rejsens forløb");
  for (const event of ordered) {
    const row = element(document, "li", "travel-event");
    row.dataset.event = event.id;
    if (event.stage) {
      row.dataset.stage = event.stage;
      row.dataset.journeySection = "";
    }
    if (event.id === "assistance") row.dataset.assistanceTask = "";
    const time = element(document, "div", "event-time");
    if (event.time) {
      const t = element(document, "time", "", clock(event.time));
      t.dateTime = event.time;
      time.append(t);
      const eventDate = localDateTime(event.time).slice(0, 10);
      if (eventDate !== date)
        time.append(element(document, "small", "", dateLabel(eventDate)));
    } else
      time.append(
        element(
          document,
          "span",
          "unlisted-time",
          event.kind === "self" ? "Selv" : "—",
        ),
      );
    const marker = element(document, "div", "event-marker");
    marker.append(icon(document, event.kind));
    const content = element(document, "div", "event-content");
    const heading = element(document, "h3");
    heading.textContent = event.title;
    content.append(heading, element(document, "p", "", event.description));
    if (event.id === "assistance") {
      const meet = element(
        document,
        "span",
        "meeting-time sr-only",
        event.time ? `Mødetid ${clock(event.time)}` : "",
      );
      content.append(meet);
    }
    row.append(time, marker, content);
    timeline.append(row);
  }
  result.append(timeline);
  const bookings = element(document, "section", "booking-overview");
  bookings.setAttribute("aria-label", "Bestillingsstatus");
  bookings.append(element(document, "h3", "", "Bestillinger"));
  for (const [id, title] of [
    ["outbound", "Til stationen"],
    ["train", "Togtider"],
    ["assistance", "DSB Handicapservice"],
    ["inbound", "Fra stationen"],
  ]) {
    const state = task(id),
      done = state.confirmed || (id === "train" && state.status === "færdig");
    const row = element(document, "div", "booking-summary");
    row.append(
      element(document, "strong", "", title),
      element(
        document,
        "span",
        done ? "confirmed-status" : "muted",
        state.selfManaged
          ? "Selvtransport"
          : done
            ? id === "train"
              ? "Kontrolleret"
              : "Bestilling bekræftet"
            : id === "train"
              ? "Ikke kontrolleret"
              : "Ikke bekræftet bestilt",
      ),
    );
    bookings.append(row);
  }
  result.append(bookings);
  const summary = priceSummary(plan);
  if (summary) {
    const prices = element(document, "section", "overview-prices");
    for (const [id, title] of [
      ["outbound", "Til stationen"],
      ["train", "Tog"],
      ["inbound", "Fra stationen"],
    ])
      if (Number.isSafeInteger(plan.manualPrices?.[id]))
        prices.append(
          element(
            document,
            "span",
            "",
            `${title} · ${money(plan.manualPrices[id])}`,
          ),
        );
    prices.append(
      element(
        document,
        "strong",
        "price-summary",
        `${summary.complete ? "Samlet pris" : "Registrerede udgifter"} · ${money(summary.cents)}`,
      ),
    );
    result.append(prices);
  }
  const checks = element(document, "details", "journey-checks");
  checks.append(
    element(document, "summary", "", "Bookingvejledning og forbehold"),
  );
  const nextAction = element(document, "div", "context-action");
  nextAction.dataset.nextAction = "";
  if (plan.nextAction?.actionType)
    nextAction.dataset.bookingAction = plan.nextAction.actionType;
  nextAction.append(
    element(document, "strong", "", plan.nextAction?.title),
    element(document, "p", "", plan.nextAction?.explanation),
  );
  checks.append(nextAction);
  if (plan.nextAction?.bookingUrl) {
    const link = element(document, "a", "", "Bestillingsinformation ↗");
    link.href = plan.nextAction.bookingUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    checks.append(link);
  }
  const uncertainties = element(document, "div");
  uncertainties.dataset.uncertainties = "";
  for (const item of plan.uncertainties ?? [])
    if (item.code !== "unknown-price" && !task(item.taskId)?.selfManaged)
      uncertainties.append(element(document, "p", "", item.explanation));
  checks.append(uncertainties);
  const rules = element(document, "div");
  rules.dataset.appliedRules = "";
  for (const rule of plan.appliedRules ?? [])
    if (!task(rule.effect?.firstTaskId)?.selfManaged)
      rules.append(
        element(
          document,
          "p",
          "",
          `${rule.explanation} Kilde: ${rule.source}. Sidst verificeret: ${rule.lastVerified}.`,
        ),
      );
  checks.append(rules);
  checks.append(
    element(
      document,
      "p",
      "",
      `Handicapservice-frist: ${task("assistance").bookingDeadline?.kind === "known" ? task("assistance").bookingDeadline.value : "skal kontrolleres hos DSB"}. Beregnet fremmøde er ikke en bekræftet assistancebestilling.`,
    ),
  );
  for (const tip of task("assistance").tips ?? [])
    checks.append(
      element(
        document,
        "p",
        "",
        `${tip.text} Kilde: ${tip.source ?? "ukendt"}. Sidst verificeret: ${tip.lastVerified ?? "ukendt"}.`,
      ),
    );
  checks.append(
    element(
      document,
      "p",
      "",
      "RejseFlex bestiller ikke handicapkørsel, Handicapservice eller billetter.",
    ),
  );
  result.append(
    checks,
    element(
      document,
      "p",
      "demo-footnote",
      plan.manualTrainTimes
        ? "Demo · Kontrollér tider og eksterne aftaler."
        : "Demo · Togtiderne er illustrative. Kontrollér tider og eksterne aftaler.",
    ),
  );
}
