import { activeConflicts } from "./journey.js";
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
      if (action === "self-transport")
        container.querySelector(`[data-self-transport="${id}"]`).checked =
          plan.tasks.find((task) => task.id === id)?.selfManaged === true;
      if (action === "interval")
        container.querySelector(".meeting-time").textContent =
          `Mødetid · ${dateTime(meetingTime(plan))}`;
      feedback.textContent =
        error.message ?? "Ændringen kunne ikke gemmes. Prøv igen.";
    } finally {
      buttons.forEach((item) => (item.disabled = false));
      if (!container.isConnected) {
        const target =
          action === "self-transport"
            ? root.querySelector(`[data-self-transport="${id}"]`)
            : action === "interval"
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
    element(
      document,
      "span",
      "eyebrow",
      plan.selected ? "3 · REJSEOVERBLIK" : "2 · REJSEOPLYSNINGER",
    ),
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
      plan.manualTrainTimes
        ? "Demo · Tiderne er dine egne oplysninger. RejseFlex kontrollerer ikke eksterne aftaler."
        : "Demo · Togtiderne er illustrative. Kontrollér tider og aftaler før en virkelig rejse.",
    ),
  );
  if (!plan.selected) {
    const save = button("Gem rejse", () => onSelect(plan), "select-plan");
    save.dataset.selectPlan = "";
    result.append(save);
  }
  const editorHost = element(document, "div", "journey-editor-host");
  editorHost.hidden = true;
  const edit = button(
    plan.selected ? "Rediger rejseoplysninger" : "Indtast rejseoplysninger",
    () => openDetails(),
    "secondary-button",
  );
  edit.dataset.editDetails = "";
  header.append(edit);
  result.append(editorHost);
  function openDetails(focusId) {
    editorHost.replaceChildren();
    editorHost.hidden = false;
    stages.hidden = true;
    documents.hidden = true;
    edit.hidden = true;
    const selectPlan = result.querySelector("[data-select-plan]");
    if (selectPlan) selectPlan.hidden = true;
    const form = element(document, "form", "journey-details-editor");
    form.append(
      element(document, "h3", "", "Rejseoplysninger"),
      element(
        document,
        "p",
        "muted",
        "Udfyld det, du ved. Resten kan tilføjes senere. Bestillinger bekræftes særskilt i overblikket.",
      ),
    );
    const inputs = {},
      prices = {},
      self = {};
    const field = (parent, labelText, type, value) => {
      const label = element(document, "label", "field", labelText);
      const input = element(document, "input");
      input.type = type;
      input.value = value ?? "";
      label.append(input);
      parent.append(label);
      return input;
    };
    for (const [id, title] of [
      ["outbound", "Til stationen"],
      ["train", "Tog og Handicapservice"],
      ["inbound", "Fra stationen"],
    ]) {
      const group = element(document, "fieldset", "detail-group");
      group.append(element(document, "legend", "", title));
      let transportFields;
      if (id !== "train") {
        self[id] = field(
          group,
          "Jeg sørger selv for transporten",
          "checkbox",
          "",
        );
        self[id].checked = task(id).selfManaged === true;
        self[id].dataset.selfTransport = id;
        transportFields = element(document, "div");
        group.append(transportFields);
        inputs[id] = field(
          transportFields,
          id === "outbound"
            ? "Afhentning ved startadressen"
            : "Afhentning ved ankomststationen",
          "datetime-local",
          localDateTime(task(id).actualBookingTime),
        );
        inputs[id].dataset.detailTime = id;
        const toggle = () => {
          transportFields.hidden = self[id].checked;
        };
        self[id].addEventListener("change", toggle);
        toggle();
        if (task(id).confirmed)
          group.append(
            element(
              document,
              "p",
              "muted",
              "Ret kun en bekræftet afhentning, hvis ændringen er aftalt med trafikselskabet.",
            ),
          );
      } else {
        for (const [key, title, value] of [
          ["departure", "Togets afgang", plan.legs[1].plannedDeparture],
          ["arrival", "Togets ankomst", plan.legs[1].plannedArrival],
        ]) {
          inputs[key] = field(
            group,
            title,
            "datetime-local",
            localDateTime(value),
          );
          inputs[key].dataset.detailTime = key;
        }
      }
      prices[id] = field(
        transportFields ?? group,
        "Eventuel pris (kr.)",
        "text",
        Number.isSafeInteger(plan.manualPrices?.[id])
          ? String(plan.manualPrices[id] / 100).replace(".", ",")
          : "",
      );
      prices[id].inputMode = "decimal";
      prices[id].dataset.manualPrice = id;
      form.append(group);
    }
    const intervalLabel = element(
      document,
      "label",
      "field",
      "Fremmøde før togafgang",
    );
    const interval = element(document, "select");
    for (const minutes of [15, 30]) {
      const option = element(document, "option", "", `${minutes} minutter`);
      option.value = String(minutes);
      interval.append(option);
    }
    interval.value = String(plan.assistanceInterval ?? 15);
    intervalLabel.append(interval);
    form.append(intervalLabel);
    const save = element(
      document,
      "button",
      "select-plan",
      "Gem oplysninger og vis overblik",
    );
    save.type = "submit";
    save.dataset.saveDetails = "";
    const cancel = button("Annuller", () => {
      editorHost.hidden = true;
      editorHost.replaceChildren();
      stages.hidden = false;
      documents.hidden = false;
      edit.hidden = false;
      if (selectPlan) selectPlan.hidden = false;
      edit.focus();
    });
    cancel.dataset.cancelDetails = "";
    form.append(save, cancel);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void execute(form, "details", {
        times: Object.fromEntries(
          Object.entries(inputs).map(([id, input]) => [id, input.value]),
        ),
        prices: Object.fromEntries(
          Object.entries(prices).map(([id, input]) => [id, input.value]),
        ),
        selfManaged: Object.fromEntries(
          Object.entries(self).map(([id, input]) => [id, input.checked]),
        ),
        interval: Number(interval.value),
      });
    });
    editorHost.append(form);
    const focusInput = focusId
      ? inputs[focusId]
      : Object.values(inputs).find((input) => !input.closest("[hidden]"));
    focusInput?.focus();
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
    if (Number.isSafeInteger(cents))
      stage.append(
        element(document, "p", "registered-price", `Pris · ${money(cents)}`),
      );
  };
  const booking = (stage, id) => {
    const bookingTask = task(id);
    const controls = element(document, "div", "stage-booking");
    if (bookingTask.selfManaged) {
      controls.append(
        element(
          document,
          "p",
          "compact-status",
          "Du sørger selv for denne transport",
        ),
      );
      if (bookingTask.confirmed)
        controls.append(
          element(
            document,
            "p",
            "muted",
            "Den tidligere eksterne bestilling er stadig registreret; den afbestilles ikke af RejseFlex.",
          ),
        );
      stage.append(controls);
      addPrice(stage, id);
      return;
    }
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
    if (!bookingTask.actualBookingTime)
      controls.append(
        button("Oplys afhentningstid", () => openDetails(id), "text-button"),
      );
    if (
      plan.selected &&
      bookingTask.actualBookingTime &&
      !bookingTask.confirmed &&
      ["klar til booking", "afventer brugerinput"].includes(bookingTask.status)
    ) {
      const confirm = button("Bekræft ekstern bestilling", () =>
        execute(controls, "confirm", undefined, id),
      );
      confirm.dataset[`confirmBooking${suffix}`] = "";
      controls.append(confirm);
    }
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
      const bookingHelp = element(document, "details", "inline-details");
      bookingHelp.append(
        element(document, "summary", "", "Næste bookingtrin"),
        action,
      );
      controls.append(bookingHelp);
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
  if (!leg.plannedDeparture || !leg.plannedArrival)
    train.append(
      button("Tilføj togtider", () => openDetails("departure"), "text-button"),
    );
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
      button(
        "Annuller",
        () => renderJourney(root, plan, onSelect, onUpdate),
        "text-button",
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
  assistance.append(
    element(
      document,
      "p",
      "muted",
      `${plan.assistanceInterval ?? 15} minutter før togafgang`,
    ),
  );
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
  for (const node of [...assistance.children]) {
    if (
      node.matches(".muted") &&
      node.textContent !==
        `${plan.assistanceInterval ?? 15} minutter før togafgang`
    )
      help.append(node);
  }
  assistance.append(help);
  train.insertBefore(assistance, times);
  const documents = element(document, "div", "stage-documents");
  documents.append(element(document, "h4", "", "Dine rejsedokumenter"));
  for (const [kind, title, accept] of [
    ["assistance", "Rejseplan / assistanceplan", ".docx"],
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
      const manage = element(document, "details", "inline-details");
      manage.append(element(document, "summary", "", "Administrer bilag"));
      manage.append(...actions.childNodes);
      actions.append(manage);
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
      );
    }
    if (reference)
      actions
        .querySelector("details")
        .append(
          button(
            "Fjern",
            () => execute(row, "remove-document", null, kind),
            "text-button",
          ),
        );
    row.append(actions);
    documents.append(row);
  }
  documents.append(
    element(document, "p", "muted", "Dokumenter gemmes kun på denne enhed."),
  );
  result.append(documents);
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
  const conflicts = activeConflicts(plan);
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
    if (item.code !== "unknown-price" && !task(item.taskId)?.selfManaged)
      uncertainties.append(element(document, "p", "", item.explanation));
  details.append(uncertainties);
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
  if (!plan.selected) openDetails();
}
