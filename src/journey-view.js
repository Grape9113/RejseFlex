import { stationSelect } from "./station-select.js";
import { exampleStations } from "./stations.js";
import {
  money,
  priceSummary,
  meetingTime,
  localDateTime,
  copenhagenInstant,
} from "./journey-details.js";
export function placeName(place) {
  return place?.label ?? place?.name ?? "Ukendt sted";
}
export function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function dateTime(value) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    try {
      value = copenhagenInstant(value);
    } catch {
      return "Tidspunkt mangler";
    }
  }
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("da-DK", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Copenhagen",
      }).format(new Date(value))
    : "Tidspunkt mangler";
}
export function renderJourney(root, plan, onSelect, onUpdate) {
  const document = root.ownerDocument,
    result = root.querySelector("#result");
  result.replaceChildren();
  result.hidden = false;
  const task = (id) => plan.tasks.find((item) => item.id === id);
  const button = (text, action, className = "secondary-button") => {
    const b = element(document, "button", className, text);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  };
  const execute = async (container, action, value, id) => {
    const feedback =
      container.querySelector(".action-feedback") ??
      container.appendChild(element(document, "p", "action-feedback"));
    feedback.setAttribute("role", "status");
    feedback.textContent = "";
    const buttons = [...container.querySelectorAll("button")];
    if (action !== "view-document")
      buttons.forEach((item) => (item.disabled = true));
    try {
      await onUpdate(plan, action, value, id);
    } catch (error) {
      if (action === "interval")
        container.querySelector(".meeting-time").textContent =
          `Mødetid · ${dateTime(meetingTime(plan))}`;
      feedback.textContent =
        error.message ?? "Ændringen kunne ikke gemmes. Prøv igen.";
    } finally {
      buttons.forEach((item) => (item.disabled = false));
      if (!container.isConnected) {
        const target =
          action === "interval"
            ? root.querySelector(`[data-meeting-interval="${value}"]`)
            : action === "price"
              ? root.querySelector(`[data-price-action="${id}"]`)
              : root.querySelector(
                  `[data-stage="${id ?? "train"}"] .stage-heading h3`,
                );
        if (target) {
          if (target.tagName === "H3") target.tabIndex = -1;
          target.focus();
        }
      }
    }
  };
  const header = element(document, "div", "journey-header");
  header.append(
    element(document, "span", "eyebrow", "REJSEOVERSIGT"),
    element(
      document,
      "h2",
      "",
      `${placeName(plan.wish.from)} → ${placeName(plan.wish.to)}`,
    ),
  );
  const requested =
    plan.wish.timeMode === "departure"
      ? plan.wish.departure
      : plan.wish.arrival;
  header.append(
    element(
      document,
      "p",
      "arrival-note",
      `${plan.wish.timeMode === "departure" ? "Ønsket afgang" : "Ønsket ankomst"} · ${dateTime(requested)}`,
    ),
  );
  result.append(header);
  result.append(
    element(
      document,
      "p",
      "demo-notice",
      "Demo · Togtiderne er illustrative. Kontrollér tider og aftaler før en virkelig rejse.",
    ),
  );
  if (!plan.selected) {
    const save = button("Gem rejse", () => onSelect(plan), "select-plan");
    save.dataset.selectPlan = "";
    result.append(save);
  }
  const stages = element(document, "div", "journey-timeline");
  result.append(stages);
  const createStage = (number, id, title) => {
    const stage = element(document, "article", "travel-stage");
    stage.dataset.journeySection = "";
    stage.dataset.stage = id;
    const heading = element(document, "div", "stage-heading");
    heading.append(
      element(document, "span", "stage-number", String(number)),
      element(document, "h3", "", title),
    );
    stage.append(heading);
    stages.append(stage);
    return stage;
  };
  const route = (stage, from, to) => {
    const line = element(document, "div", "stage-route");
    line.append(
      element(document, "strong", "", placeName(from)),
      element(document, "span", "route-arrow", "→"),
      element(document, "strong", "", placeName(to)),
    );
    stage.append(line);
  };
  const addPrice = (stage, id) => {
    const cents = plan.manualPrices?.[id];
    const controls = element(document, "div", "price-control");
    const add = button(
      Number.isSafeInteger(cents)
        ? `${money(cents)} · Redigér pris`
        : "Tilføj pris",
      () => {
        editor.hidden = false;
        add.hidden = true;
        input.focus();
      },
      "text-button",
    );
    add.dataset.priceAction = id;
    const editor = element(document, "form", "price-editor");
    editor.hidden = true;
    const label = element(document, "label", "field", "Faktisk pris (DKK)");
    const input = element(document, "input");
    input.type = "text";
    input.inputMode = "decimal";
    input.value = Number.isSafeInteger(cents)
      ? String(cents / 100).replace(".", ",")
      : "";
    input.dataset.manualPrice = id;
    label.append(input);
    const save = element(document, "button", "secondary-button", "Gem pris");
    save.type = "submit";
    editor.addEventListener("submit", (event) => {
      event.preventDefault();
      void execute(controls, "price", input.value, id);
    });
    const cancel = button(
      "Annullér",
      () => {
        editor.hidden = true;
        add.hidden = false;
      },
      "text-button",
    );
    editor.append(label, save, cancel);
    if (Number.isSafeInteger(cents))
      editor.append(
        button(
          "Fjern pris",
          () => execute(controls, "price", null, id),
          "text-button",
        ),
      );
    controls.append(add, editor);
    stage.append(controls);
  };
  const booking = (stage, id) => {
    const bookingTask = task(id);
    const controls = element(document, "div", "stage-booking");
    const suffix = id === "outbound" ? "Outbound" : "";
    if (bookingTask.actualBookingTime)
      controls.append(
        element(
          document,
          "p",
          "actual-time",
          `Oplyst afhentning · ${dateTime(bookingTask.actualBookingTime)}`,
        ),
      );
    if (bookingTask.confirmed)
      controls.append(
        element(
          document,
          "p",
          "compact-status",
          "Ekstern bestilling bekræftet",
        ),
      );
    if (
      plan.selected &&
      (bookingTask.confirmed ||
        ["klar til booking", "afventer brugerinput"].includes(
          bookingTask.status,
        ))
    ) {
      const editor = element(document, "form", "pickup-editor");
      const label = element(
        document,
        "label",
        "field",
        "Oplyst afhentningstid",
      );
      const input = element(document, "input");
      input.type = "datetime-local";
      input.value = localDateTime(bookingTask.actualBookingTime);
      input.required = true;
      input.dataset[`bookingTime${suffix}`] = "";
      label.append(input);
      const save = element(
        document,
        "button",
        "secondary-button",
        bookingTask.actualBookingTime
          ? "Gem ændret tid"
          : "Registrér oplyst tid",
      );
      save.type = "submit";
      save.dataset[`recordTime${suffix}`] = "";
      editor.append(label, save);
      editor.addEventListener("submit", (event) => {
        event.preventDefault();
        void execute(
          controls,
          bookingTask.confirmed ? "edit-time" : "time",
          input.value,
          id,
        );
      });
      if (bookingTask.confirmed) {
        const details = element(document, "details", "inline-details");
        details.append(
          element(document, "summary", "", "Redigér aftalt afhentningstid"),
          element(
            document,
            "p",
            "muted",
            "Ændr kun tiden, hvis du har aftalt ændringen med trafikselskabet.",
          ),
          editor,
        );
        controls.append(details);
      } else controls.append(editor);
      if (bookingTask.actualBookingTime && !bookingTask.confirmed) {
        const confirm = button("Bekræft ekstern bestilling", () =>
          execute(controls, "confirm", undefined, id),
        );
        confirm.dataset[`confirmBooking${suffix}`] = "";
        controls.append(confirm);
      }
    } else if (plan.selected && !bookingTask.confirmed)
      controls.append(
        element(
          document,
          "p",
          "muted",
          "Afhentningstid kan registreres, når Handicapservice er bekræftet.",
        ),
      );
    if (plan.nextAction.taskId === id) {
      const action = element(document, "div", "context-action");
      action.dataset.nextAction = "";
      if (plan.nextAction.actionType)
        action.dataset.bookingAction = plan.nextAction.actionType;
      action.append(element(document, "strong", "", plan.nextAction.title));
      // Booking channels are preserved; tariff estimates are deliberately omitted.
      action.append(
        element(
          document,
          "p",
          "",
          bookingTask.actualBookingTime
            ? "Kontrollér den oplyste tid, og bekræft derefter bestillingen."
            : "Bestil hos dit trafikselskab, og registrér den oplyste afhentningstid her.",
        ),
      );
      if (plan.nextAction.bookingUrl) {
        const link = element(
          document,
          "a",
          "booking-link",
          "Bestillingsinformation ↗",
        );
        link.href = plan.nextAction.bookingUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        action.append(link);
      }
      controls.append(action);
    }
    stage.append(controls);
    addPrice(stage, id);
  };
  const first = createStage(1, "outbound", "Handicapkørsel til stationen");
  route(first, plan.legs[0].from, plan.legs[0].to);
  booking(first, "outbound");
  const train = createStage(2, "train", "Togrejse & DSB Handicapservice");
  const leg = plan.legs[1];
  route(train, leg.fromStation, leg.toStation);
  const times = element(document, "div", "train-times");
  for (const [label, value] of [
    ["Afgang", leg.plannedDeparture],
    ["Ankomst", leg.plannedArrival],
  ]) {
    const item = element(document, "div");
    item.append(
      element(document, "span", "muted", label),
      element(document, "strong", "", dateTime(value)),
    );
    times.append(item);
  }
  train.append(times);
  if (
    !plan.tasks.some(
      (item) =>
        item.confirmed || item.actualBookingTime || item.status === "færdig",
    )
  ) {
    const stationEditor = element(document, "details", "inline-details");
    stationEditor.append(element(document, "summary", "", "Redigér stationer"));
    const selection = { from: leg.fromStation, to: leg.toStation };
    for (const [key, label] of [
      ["from", "Afgangsstation"],
      ["to", "Ankomststation"],
    ])
      stationEditor.append(
        stationSelect(document, {
          label,
          stations: exampleStations,
          selected: selection[key],
          onChange: (value) => {
            selection[key] = value;
          },
        }),
      );
    stationEditor.append(
      element(
        document,
        "p",
        "muted",
        "Foreløbig eksempelstationer. Tidligere valgte stationer bevares i listen.",
      ),
      button("Gem stationsvalg", () =>
        execute(stationEditor, "stations", { ...selection }),
      ),
    );
    train.append(stationEditor);
  }
  const trainTask = task("train");
  if (plan.selected && trainTask.status === "klar til booking") {
    const confirm = button("Markér togforslaget som kontrolleret", () =>
      execute(train, "confirm-train"),
    );
    confirm.dataset.confirmTrain = "";
    train.append(confirm);
  } else if (trainTask.status === "færdig")
    train.append(
      element(document, "p", "compact-status", "Togforslag kontrolleret"),
    );
  const assistance = element(document, "div", "assistance-inline");
  assistance.dataset.assistanceTask = "";
  assistance.append(element(document, "h4", "", "DSB Handicapservice"));
  const meeting = element(
    document,
    "p",
    "meeting-time",
    `Mødetid · ${dateTime(meetingTime(plan))}`,
  );
  assistance.append(meeting);
  const fieldset = element(document, "fieldset", "meeting-control");
  fieldset.append(element(document, "legend", "", "Mød før togafgang"));
  const segments = element(document, "div", "segmented-control");
  for (const minutes of [15, 30]) {
    const choice = button(
      `${minutes} minutter`,
      () => {
        meeting.textContent = `Mødetid · ${dateTime(meetingTime({ ...plan, assistanceInterval: minutes }))}`;
        void execute(assistance, "interval", minutes);
      },
      "segment",
    );
    choice.setAttribute(
      "aria-pressed",
      String((plan.assistanceInterval ?? 15) === minutes),
    );
    choice.dataset.meetingInterval = String(minutes);
    segments.append(choice);
  }
  fieldset.append(segments);
  assistance.append(fieldset);
  assistance.append(
    element(
      document,
      "p",
      "muted",
      "Beregnet mødetid. Følg altid tidspunktet i din assistanceplan.",
    ),
  );
  if (task("assistance").confirmed) {
    assistance.append(
      element(
        document,
        "p",
        "compact-status",
        "Bekræftet ekstern Handicapservice-bestilling",
      ),
    );
    if (
      task("assistance").trainIdentity?.plannedDeparture !==
      leg.plannedDeparture
    )
      assistance.append(
        element(
          document,
          "p",
          "inline-error",
          `Assistance er fortsat knyttet til den bekræftede togafgang ${dateTime(task("assistance").trainIdentity?.plannedDeparture)}.`,
        ),
      );
  } else if (
    plan.selected &&
    task("assistance").status === "klar til booking"
  ) {
    const confirm = button("Bekræft ekstern Handicapservice-bestilling", () =>
      execute(assistance, "confirm-assistance"),
    );
    confirm.dataset.confirmAssistance = "";
    assistance.append(confirm);
  } else if (plan.selected)
    assistance.append(
      element(
        document,
        "p",
        "muted",
        "Kontrollér togforslaget efter bestilling af sidste handicapkørsel.",
      ),
    );
  const help = element(document, "details", "inline-details");
  help.append(element(document, "summary", "", "Bestilling og frister"));
  help.append(
    element(
      document,
      "p",
      "muted",
      `Bestillingsfrist: ${task("assistance").bookingDeadline?.kind === "known" ? task("assistance").bookingDeadline.value : "skal kontrolleres hos DSB"}.`,
    ),
  );
  for (const tip of task("assistance").tips ?? [])
    help.append(
      element(
        document,
        "p",
        "muted",
        `${tip.text} Kilde: ${tip.source ?? "ukendt"}. Sidst verificeret: ${tip.lastVerified ?? "ukendt"}.`,
      ),
    );
  const dsb = element(document, "a", "", "DSB Handicapservice ↗");
  dsb.href = "https://www.dsb.dk/kundeservice/handicapservice/";
  dsb.target = "_blank";
  dsb.rel = "noopener noreferrer";
  help.append(dsb);
  assistance.append(help);
  train.append(assistance);
  const documents = element(document, "div", "stage-documents");
  documents.append(element(document, "h4", "", "Dine rejsedokumenter"));
  for (const [kind, title, accept] of [
    ["assistance", "Assistanceplan", ".docx"],
    ["ticket", "Kørestolspladsbillet", ".pdf"],
  ]) {
    const row = element(document, "div", "document-row");
    const reference = plan.documentReferences?.find(
      (item) => item.kind === kind,
    );
    const info = element(document, "div");
    info.append(
      element(document, "strong", "", title),
      element(
        document,
        "span",
        "muted",
        reference?.name ??
          (kind === "assistance" ? "Word-dokument · DOCX" : "PDF-dokument"),
      ),
    );
    row.append(info);
    const actions = element(document, "div", "document-actions");
    const upload = element(document, "input");
    upload.type = "file";
    upload.accept = accept;
    upload.hidden = true;
    upload.dataset.uploadDocument = kind;
    upload.addEventListener("change", () => {
      const file = upload.files?.[0];
      if (file) void execute(row, "document", file, kind);
      upload.value = "";
    });
    actions.append(
      button(
        reference ? "Erstat" : "Tilføj",
        () => upload.click(),
        "text-button",
      ),
      upload,
    );
    if (reference) {
      actions.prepend(
        button(
          "Vis",
          () => execute(row, "view-document", reference.id),
          "secondary-button",
        ),
      );
      actions.append(
        button(
          "Hent original",
          () => execute(row, "download-document", reference.id),
          "text-button",
        ),
        button(
          "Fjern",
          () => execute(row, "remove-document", null, kind),
          "text-button",
        ),
      );
    }
    row.append(actions);
    documents.append(row);
  }
  documents.append(
    element(document, "p", "muted", "Dokumenter gemmes kun på denne enhed."),
  );
  train.append(documents);
  addPrice(train, "train");
  const last = createStage(3, "inbound", "Handicapkørsel til destinationen");
  route(last, plan.legs[2].from, plan.legs[2].to);
  booking(last, "inbound");
  const summary = priceSummary(plan);
  if (summary)
    result.append(
      element(
        document,
        "p",
        "price-summary",
        `${summary.complete ? "Samlet pris" : "Registrerede udgifter"} · ${money(summary.cents)}`,
      ),
    );
  const conflicts = plan.conflicts ?? [];
  if (conflicts.length) {
    const warning = element(document, "div", "journey-conflicts");
    warning.dataset.conflicts = "";
    warning.append(
      element(document, "strong", "", "Kontrollér rejseaftalerne"),
    );
    for (const conflict of conflicts)
      warning.append(element(document, "p", "", conflict.explanation));
    result.insertBefore(warning, stages);
  }
  const details = element(document, "details", "journey-checks");
  details.append(
    element(
      document,
      "summary",
      "",
      "Forbehold og oplysninger, der skal kontrolleres",
    ),
  );
  const uncertainties = element(document, "div");
  uncertainties.dataset.uncertainties = "";
  for (const item of [
    ...new Map(
      (plan.uncertainties ?? []).map((item) => [item.explanation, item]),
    ).values(),
  ])
    if (item.code !== "unknown-price")
      uncertainties.append(element(document, "p", "", item.explanation));
  details.append(uncertainties);
  const rules = element(document, "div");
  rules.dataset.appliedRules = "";
  for (const rule of plan.appliedRules ?? [])
    rules.append(
      element(
        document,
        "p",
        "",
        `${rule.explanation} Kilde: ${rule.source}. Sidst verificeret: ${rule.lastVerified}.`,
      ),
    );
  details.append(rules);
  details.append(
    element(
      document,
      "p",
      "",
      "RejseFlex bestiller ikke handicapkørsel, Handicapservice eller billetter.",
    ),
  );
  result.append(details);
}
