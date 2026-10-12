let sequence = 0;
export function stationSelect(
  document,
  { label, stations, selected = null, onChange },
) {
  const id = `station-select-${++sequence}`;
  const wrapper = document.createElement("div");
  wrapper.className = "station-select place-field";
  const caption = document.createElement("label");
  caption.htmlFor = id;
  caption.className = "field";
  caption.textContent = label;
  const row = document.createElement("div");
  row.className = "station-input-row";
  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = "Søg og vælg station";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", `${id}-options`);
  input.setAttribute("aria-expanded", "false");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "×";
  clear.setAttribute("aria-label", `Ryd ${label.toLowerCase()}`);
  const list = document.createElement("div");
  list.className = "place-options";
  list.id = `${id}-options`;
  list.setAttribute("role", "listbox");
  const feedback = document.createElement("div");
  feedback.className = "place-feedback";
  feedback.setAttribute("role", "status");
  row.append(input, clear);
  wrapper.append(caption, row, list, feedback);
  let current = selected,
    matches = [],
    active = -1;
  input.value = selected?.name ?? "";
  const available =
    selected && !stations.some((item) => item.id === selected.id)
      ? [selected, ...stations]
      : stations;
  function close() {
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }
  function choose(station) {
    current = station;
    input.value = station?.name ?? "";
    feedback.textContent = "";
    close();
    onChange(station);
  }
  function paint() {
    list.replaceChildren();
    input.setAttribute("aria-expanded", "true");
    matches.forEach((station, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.tabIndex = -1;
      option.className = "place-option";
      option.id = `${id}-option-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute(
        "aria-selected",
        String(active >= 0 ? index === active : station.id === current?.id),
      );
      option.textContent = station.name;
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => {
        choose(station);
        input.focus();
      });
      list.append(option);
    });
    feedback.textContent = matches.length
      ? ""
      : "Ingen stationer matcher. Prøv et andet navn.";
    if (active >= 0)
      input.setAttribute("aria-activedescendant", `${id}-option-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }
  function search() {
    matches = available.filter((station) =>
      station.name
        .toLocaleLowerCase("da")
        .includes(input.value.toLocaleLowerCase("da")),
    );
    active = -1;
    paint();
  }
  input.addEventListener("input", () => {
    if (current) {
      current = null;
      onChange(null);
    }
    search();
  });
  input.addEventListener("focus", search);
  input.addEventListener("blur", () => {
    close();
    if (!current && input.value) {
      input.value = "";
      feedback.textContent = "Vælg en station fra listen.";
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (input.getAttribute("aria-expanded") !== "true") search();
      if (matches.length) {
        active =
          active < 0
            ? event.key === "ArrowDown"
              ? 0
              : matches.length - 1
            : (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
              matches.length;
        paint();
        list.children[active]?.scrollIntoView?.({ block: "nearest" });
      }
    }
    if (
      event.key === "Enter" &&
      input.getAttribute("aria-expanded") === "true"
    ) {
      event.preventDefault();
      if (active >= 0) choose(matches[active]);
    }
  });
  clear.addEventListener("click", () => {
    choose(null);
    input.focus();
  });
  return wrapper;
}
