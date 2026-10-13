import {
  element,
  button,
  icon,
  placeName,
  clock,
  dateLabel,
} from "./journey-ui.js";
import {
  journeyDate,
  localDateTime,
  resolveJourneyTimes,
  meetingTime,
} from "./journey-details.js";
import { applyJourneyEdit } from "./journey-edit.js";
import {
  prepareDocument,
  openDocument,
  downloadDocument,
} from "./documents.js";

export function renderJourneyEditor(document, plan, handlers, draft) {
  const form = element(document, "form", "journey-details-editor");
  const task = (id) => plan.tasks.find((item) => item.id === id);
  const baseDate = journeyDate(plan);
  const originals = {
    outbound: task("outbound").actualBookingTime,
    departure: plan.legs[1].plannedDeparture,
    arrival: plan.legs[1].plannedArrival,
    inbound: task("inbound").actualBookingTime,
  };
  const inputs = {},
    dateInputs = {},
    prices = {},
    self = {},
    groups = {},
    bookingHosts = {};
  const confirmations = [...(draft?.confirmations ?? [])];
  const changes = { ...draft?.documents };
  let ticketType = draft?.ticketType ?? plan.ticketType ?? null;
  const dateOverrides = { ...(draft?.dateOverrides ?? plan.timeDateOverrides) };
  if (!draft && plan.timeDateOverrides === undefined) {
    for (const [id, value] of Object.entries(originals)) {
      const date = localDateTime(value).slice(0, 10);
      if (date && date !== baseDate) dateOverrides[id] = date;
    }
  }
  const feedback = element(document, "p", "action-feedback");
  feedback.setAttribute("role", "status");
  const field = (parent, caption, type, value, className = "field") => {
    const label = element(document, "label", className, caption);
    const input = element(document, "input");
    input.type = type;
    input.value = value ?? "";
    label.append(input);
    parent.append(label);
    return input;
  };
  const collect = () => {
    const clocks = Object.fromEntries(
      Object.entries(inputs).map(([id, input]) => [id, input.value]),
    );
    const selfManaged = Object.fromEntries(
      Object.entries(self).map(([id, input]) => [id, input.checked]),
    );
    const times = resolveJourneyTimes(plan, clocks, dateOverrides, selfManaged);
    for (const id of ["outbound", "inbound"])
      if (selfManaged[id] && clocks[id])
        times[id] =
          `${dateOverrides[id] ?? (localDateTime(originals[id]).slice(0, 10) || baseDate)}T${clocks[id]}`;
    return {
      times,
      clocks,
      dateOverrides: { ...dateOverrides },
      selfManaged,
      prices: Object.fromEntries(
        Object.entries(prices).map(([id, input]) => [id, input.value]),
      ),
      interval: Number(interval.value),
      ticketType,
      confirmations: [...confirmations],
      documents: { ...changes },
    };
  };
  const rawDraft = () => ({
    clocks: Object.fromEntries(
      Object.entries(inputs).map(([id, input]) => [id, input.value]),
    ),
    dateOverrides: { ...dateOverrides },
    selfManaged: Object.fromEntries(
      Object.entries(self).map(([id, input]) => [id, input.checked]),
    ),
    prices: Object.fromEntries(
      Object.entries(prices).map(([id, input]) => [id, input.value]),
    ),
    interval: Number(interval.value),
    ticketType,
    confirmations: [...confirmations],
    documents: { ...changes },
  });
  const confirm = (id) => {
    try {
      const values = collect();
      applyJourneyEdit(plan, {
        ...values,
        confirmations: [...confirmations, id],
      });
      confirmations.push(id);
      feedback.textContent = "Bekræftelsen gemmes sammen med rejsen.";
      refresh();
      const heading =
        groups[id === "assistance" ? "train" : id].querySelector("h3");
      heading.tabIndex = -1;
      heading.focus();
    } catch (error) {
      feedback.textContent = error.message;
    }
  };
  function timeField(parent, id, title) {
    const wrap = element(document, "div", "clock-field");
    const input = field(
      wrap,
      title,
      "time",
      draft?.clocks?.[id] ?? localDateTime(originals[id]).slice(11),
    );
    input.dataset.detailTime = id;
    inputs[id] = input;
    const dateToggle = button(
      document,
      "Dato",
      () => {
        dateBox.hidden = !dateBox.hidden;
        if (!dateBox.hidden) dateInput.focus();
      },
      "date-toggle text-button",
    );
    dateToggle.setAttribute("aria-expanded", "false");
    const dateBox = element(document, "div", "date-correction");
    dateBox.hidden = true;
    const dateInput = field(
      dateBox,
      `Dato for ${title.toLowerCase()}`,
      "date",
      dateOverrides[id] ??
        (localDateTime(originals[id]).slice(0, 10) || baseDate),
    );
    if (!dateInput.value) dateInput.value = baseDate;
    dateInput.dataset.detailDate = id;
    dateInputs[id] = { input: dateInput, toggle: dateToggle, box: dateBox };
    dateToggle.addEventListener("click", () =>
      dateToggle.setAttribute("aria-expanded", String(!dateBox.hidden)),
    );
    dateInput.addEventListener("change", () => {
      dateOverrides[id] = dateInput.value;
      refresh();
    });
    dateBox.append(
      button(
        document,
        "Brug automatisk dato",
        () => {
          delete dateOverrides[id];
          dateBox.hidden = true;
          dateToggle.setAttribute("aria-expanded", "false");
          refresh();
        },
        "text-button",
      ),
    );
    wrap.append(dateToggle, dateBox);
    parent.append(wrap);
  }
  for (const [id, title, from, to, kind] of [
    [
      "outbound",
      "Handicapkørsel til stationen",
      plan.wish.from,
      plan.legs[1].fromStation,
      "car",
    ],
    [
      "train",
      "Togrejse og DSB Handicapservice",
      plan.legs[1].fromStation,
      plan.legs[1].toStation,
      "train",
    ],
    [
      "inbound",
      "Handicapkørsel fra stationen",
      plan.legs[1].toStation,
      plan.wish.to,
      "car",
    ],
  ]) {
    const group = element(document, "section", "edit-section");
    group.dataset.journeySection = "";
    group.dataset.editSection = id;
    groups[id] = group;
    const heading = element(document, "h3");
    heading.append(icon(document, kind), document.createTextNode(title));
    group.append(
      heading,
      element(
        document,
        "p",
        "edit-route",
        `${placeName(from)} → ${placeName(to)}`,
      ),
    );
    const fields = element(document, "div", "edit-fields");
    if (id !== "train") {
      const label = element(document, "label", "self-choice");
      const check = element(document, "input");
      check.type = "checkbox";
      check.checked = draft?.selfManaged?.[id] ?? task(id).selfManaged === true;
      check.dataset.selfTransport = id;
      self[id] = check;
      label.append(
        check,
        document.createTextNode("Jeg sørger selv for transporten"),
      );
      group.append(label);
      timeField(fields, id, "Afhentningstid");
      const note = element(
        document,
        "p",
        "self-note",
        id === "outbound"
          ? "Du sørger selv for transporten til stationen."
          : "Du sørger selv for transporten fra stationen.",
      );
      group.append(note);
      const toggle = () => {
        fields.hidden = check.checked;
        note.hidden = !check.checked;
        refresh();
      };
      check.addEventListener("change", toggle);
      fields.hidden = check.checked;
      note.hidden = !check.checked;
    } else {
      timeField(fields, "departure", "Togets afgang");
      timeField(fields, "arrival", "Togets ankomst");
    }
    prices[id] = field(
      fields,
      "Eventuel pris (kr.)",
      "text",
      draft?.prices?.[id] ??
        (Number.isSafeInteger(plan.manualPrices?.[id])
          ? String(plan.manualPrices[id] / 100).replace(".", ",")
          : ""),
    );
    prices[id].inputMode = "decimal";
    prices[id].dataset.manualPrice = id;
    group.append(fields);
    bookingHosts[id] = element(document, "div", "edit-booking");
    group.append(bookingHosts[id]);
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
  interval.value = String(draft?.interval ?? plan.assistanceInterval ?? 15);
  intervalLabel.append(interval);
  const meeting = element(document, "output", "meeting-preview");
  meeting.setAttribute("aria-live", "polite");
  const assistance = element(document, "div", "edit-assistance");
  assistance.append(intervalLabel, meeting);
  groups.train.insertBefore(assistance, bookingHosts.train);
  bookingHosts.assistance = element(document, "div", "edit-booking");
  groups.train.append(bookingHosts.assistance);
  const documents = element(document, "section", "edit-section edit-documents");
  documents.dataset.editSection = "documents";
  const docsHeading = element(document, "h3");
  docsHeading.append(
    icon(document, "document"),
    document.createTextNode("Billetter og rejsedokumenter"),
  );
  documents.append(docsHeading);
  const ticketGroup = element(document, "fieldset", "ticket-choice");
  ticketGroup.append(element(document, "legend", "", "Billetform"));
  const segments = element(document, "div", "segmented-control");
  segments.setAttribute("role", "group");
  segments.setAttribute("aria-label", "Billetform");
  for (const [value, label] of [
    ["dsb", "DSB"],
    ["rejsekort", "Rejsekort"],
  ]) {
    const choice = button(
      document,
      label,
      () => {
        ticketType = ticketType === value ? null : value;
        paintTicket();
      },
      "segment",
    );
    choice.dataset.ticketType = value;
    segments.append(choice);
    choice.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next =
          event.key === "Home"
            ? "dsb"
            : event.key === "End"
              ? "rejsekort"
              : value === "dsb"
                ? "rejsekort"
                : "dsb";
        ticketType = next;
        paintTicket();
        segments.querySelector(`[data-ticket-type=${next}]`).focus();
      }
    });
  }
  const ticketNote = element(document, "p", "muted");
  ticketGroup.append(segments, ticketNote);
  documents.append(ticketGroup);
  function paintTicket() {
    for (const b of segments.children)
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.ticketType === ticketType),
      );
    ticketNote.textContent =
      ticketType === "dsb"
        ? "Din almindelige togbillet findes i DSB-appen."
        : ticketType === "rejsekort"
          ? "Du bruger Rejsekort-appen. Husk at tjekke ind."
          : "Billetform er ikke angivet. Vælg, når du ved det.";
  }
  paintTicket();
  for (const [kind, title, accept] of [
    ["ticket", "Kørestolspladsbillet", ".pdf"],
    ["assistance", "Rejseplan / assistanceplan", ".docx,.pdf"],
  ]) {
    const row = element(document, "div", "edit-document");
    const info = element(document, "div");
    info.append(element(document, "strong", "", title));
    const name = element(document, "span", "muted");
    info.append(name);
    const actions = element(document, "div", "document-actions");
    const upload = element(document, "input");
    upload.type = "file";
    upload.accept = accept;
    upload.hidden = true;
    upload.dataset.uploadDocument = kind;
    const getReference = () =>
      kind in changes
        ? changes[kind]
        : (plan.documentReferences ?? []).find((ref) => ref.kind === kind);
    const paint = () => {
      const ref = getReference();
      name.textContent = ref?.name ?? "Intet dokument tilføjet";
      actions.replaceChildren(
        button(
          document,
          ref ? "Udskift" : "Tilføj",
          () => upload.click(),
          "secondary-button",
        ),
      );
      if (ref) {
        actions.append(
          button(
            document,
            "Åbn",
            async () => {
              try {
                if (changes[kind]) await openDocument(document, changes[kind]);
                else await handlers.onUpdate(plan, "view-document", ref.id);
              } catch (error) {
                feedback.textContent = error.message;
              }
            },
            "text-button",
          ),
          button(
            document,
            "Hent original",
            async () => {
              try {
                if (changes[kind]) downloadDocument(document, changes[kind]);
                else await handlers.onUpdate(plan, "download-document", ref.id);
              } catch (error) {
                feedback.textContent = error.message;
              }
            },
            "text-button",
          ),
          button(
            document,
            "Fjern",
            () => {
              changes[kind] = null;
              paint();
            },
            "text-button",
          ),
        );
      }
      actions.append(upload);
    };
    upload.addEventListener("change", async () => {
      const file = upload.files?.[0];
      upload.value = "";
      if (!file) return;
      uploading++;
      save.disabled = true;
      try {
        changes[kind] = await prepareDocument(file, kind, plan.id);
        paint();
        feedback.textContent = "Bilaget gemmes, når du gemmer rejsen.";
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        uploading--;
        save.disabled = uploading > 0;
      }
    });
    row.append(info, actions);
    documents.append(row);
    paint();
  }
  documents.append(
    element(
      document,
      "p",
      "muted",
      "Dokumenter gemmes kun på denne enhed. Billetformen er uafhængig af de to bilag.",
    ),
  );
  form.append(documents);
  const footer = element(document, "div", "editor-actions");
  const save = element(
    document,
    "button",
    "select-plan",
    "Gem og vis rejseoverblik",
  );
  save.type = "submit";
  save.dataset.saveDetails = "";
  const cancel = button(
    document,
    "Annuller",
    handlers.onCancel,
    "secondary-button",
  );
  cancel.dataset.cancelDetails = "";
  const route = button(
    document,
    "← Ret planlægning",
    () => handlers.onRoute(rawDraft()),
    "text-button",
  );
  route.dataset.editRoute = "";
  footer.append(save, cancel, route);
  form.append(feedback, footer);
  let uploading = 0;
  form.addEventListener("input", () => refresh());
  form.addEventListener("change", () => refresh());
  function refresh() {
    let preview;
    try {
      const values = collect();
      preview = applyJourneyEdit(plan, values);
      const value = meetingTime({ ...preview, manualTrainTimes: true });
      meeting.textContent = value
        ? `Fremmøde kl. ${clock(value)} · ${dateLabel(localDateTime(value))}`
        : "Fremmøde beregnes, når togafgangen er oplyst.";
      for (const [id, { input, toggle }] of Object.entries(dateInputs)) {
        const resolved = values.times[id]?.slice(0, 10);
        if (resolved && !dateOverrides[id]) input.value = resolved;
        toggle.textContent =
          resolved && resolved !== baseDate ? dateLabel(resolved) : "Ret dato";
      }
    } catch (error) {
      meeting.textContent = error.message;
    }
    if (!preview) return;
    for (const id of ["outbound", "train", "assistance", "inbound"]) {
      const host = bookingHosts[id],
        current = preview.tasks.find((item) => item.id === id);
      host.replaceChildren();
      if (current.selfManaged) {
        host.append(
          element(
            document,
            "span",
            "booking-state",
            "Ingen handicapkørsel nødvendig",
          ),
        );
        if (current.confirmed)
          host.append(
            element(
              document,
              "span",
              "muted",
              "Den tidligere bestilling afbestilles ikke automatisk.",
            ),
          );
        continue;
      }
      const done =
        current.confirmed || (id === "train" && current.status === "færdig");
      host.append(
        element(
          document,
          "span",
          "booking-state",
          done
            ? id === "train"
              ? "Togtider kontrolleret"
              : id === "assistance"
                ? "Handicapservice-bestilling bekræftet"
                : "Ekstern bestilling bekræftet"
            : id === "train"
              ? "Togtider skal kontrolleres"
              : id === "assistance"
                ? "Handicapservice er ikke bekræftet bestilt"
                : "Handicapkørsel er ikke bekræftet bestilt",
        ),
      );
      const allowed =
        id === "train"
          ? current.status === "klar til booking"
          : id === "assistance"
            ? current.status === "klar til booking"
            : current.actualBookingTime &&
              ["klar til booking", "afventer brugerinput"].includes(
                current.status,
              );
      if (!done && allowed) {
        const b = button(
          document,
          id === "train"
            ? "Bekræft kontrollerede togtider"
            : id === "assistance"
              ? "Bekræft bestilt Handicapservice"
              : "Bekræft ekstern bestilling",
          () => confirm(id),
          "text-button",
        );
        if (id === "train") b.dataset.confirmTrain = "";
        else if (id === "assistance") b.dataset.confirmAssistance = "";
        else
          b.dataset[
            id === "outbound" ? "confirmBookingOutbound" : "confirmBooking"
          ] = "";
        host.append(b);
      }
    }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (uploading) return;
    feedback.textContent = "";
    const buttons = [...form.querySelectorAll("button")];
    buttons.forEach((b) => (b.disabled = true));
    try {
      await handlers.onSave(collect());
    } catch (error) {
      feedback.textContent = `Rejsen er ikke gemt. ${error.message ?? "Prøv igen."}`;
      buttons.forEach((b) => (b.disabled = false));
    }
  });
  refresh();
  return form;
}
