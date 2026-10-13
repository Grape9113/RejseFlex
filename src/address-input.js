import { element } from "./journey-view.js";
import { addressKey } from "./address-favorites.js";

// The popup uses a grid: address selection and the favorite button are separate cells.
// This avoids nesting interactive buttons inside listbox options.
export function bindAddressSearch(root, selected, geocoder, map, store) {
  const document = root.ownerDocument;
  let favorites = [],
    favoriteQueue = Promise.resolve();
  const refreshers = [];
  const loadingFavorites = Promise.resolve()
    .then(() => store?.listFavorites?.() ?? [])
    .then((value) => {
      favorites = value;
      refreshers.forEach((render) => render());
    })
    .catch(() => {});
  favoriteQueue = loadingFavorites;
  for (const field of ["from", "to"]) {
    const input = root.querySelector(`[name="${field}"]`);
    const feedback = root.querySelector(`[data-feedback="${field}"]`);
    const options = root.querySelector(`[data-options="${field}"]`);
    const wrapper = input.closest(".place-field");
    options.setAttribute("role", "grid");
    options.setAttribute("aria-label", "Adresseforslag");
    input.setAttribute("aria-haspopup", "grid");
    let timer,
      controller,
      generation = 0,
      active = -1,
      places = [],
      visible = [],
      open = false,
      pointerInside = false,
      rendering = false;
    const optionId = (index) => `${field}-option-${index}`;
    const showMap = () => {
      const entries = Object.entries(selected).filter(([, place]) => place);
      map?.show(
        entries.map(([, place]) => place),
        { roles: entries.map(([key]) => key) },
      );
    };
    function close() {
      open = false;
      options.replaceChildren();
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    }
    function dismiss() {
      generation++;
      clearTimeout(timer);
      controller?.abort();
      input.removeAttribute("aria-busy");
      close();
    }
    function highlight(index) {
      active = index;
      options
        .querySelectorAll("[data-address-cell]")
        .forEach((cell, i) =>
          cell.setAttribute("aria-selected", String(i === index)),
        );
      if (index >= 0) {
        input.setAttribute("aria-activedescendant", optionId(index));
        options
          .querySelector(`#${optionId(index)}`)
          ?.scrollIntoView?.({ block: "nearest" });
      } else input.removeAttribute("aria-activedescendant");
    }
    function choose(place) {
      selected[field] = place;
      input.value = place.label;
      dismiss();
      feedback.textContent = "";
      showMap();
      input.focus();
    }
    function render() {
      if (!open) return;
      const focusedKey = document.activeElement?.dataset.favoriteKey;
      rendering = true;
      const keys = new Set(favorites.map(addressKey));
      const groups = [
        ["Favoritter", favorites],
        [
          "Søgeresultater",
          places.filter((place) => !keys.has(addressKey(place))),
        ],
      ];
      const activeKey = active >= 0 ? addressKey(visible[active]) : null;
      visible = [];
      options.replaceChildren();
      for (const [title, items] of groups) {
        if (!items.length) continue;
        const heading = element(document, "div", "address-group-title", title);
        heading.setAttribute("role", "row");
        const text = element(document, "span", "", title);
        heading.textContent = "";
        text.setAttribute("role", "columnheader");
        text.setAttribute("aria-colspan", "2");
        heading.append(text);
        options.append(heading);
        for (const place of items) {
          const index = visible.length;
          visible.push(place);
          const row = element(document, "div", "address-row");
          row.setAttribute("role", "row");
          const cell = element(document, "div", "address-cell");
          cell.id = optionId(index);
          cell.dataset.addressCell = "";
          cell.setAttribute("role", "gridcell");
          cell.setAttribute("aria-selected", "false");
          const option = element(document, "button", "address-choice");
          option.type = "button";
          option.tabIndex = -1;
          option.dataset.placeOption = field;
          option.append(
            element(document, "strong", "", place.primary ?? place.label),
          );
          if (place.secondary)
            option.append(element(document, "span", "", place.secondary));
          // Keep mouse focus on the combobox. Touch keeps native scrolling and selects on click.
          option.addEventListener("mousedown", (event) => {
            if (event.button === 0) event.preventDefault();
          });
          option.addEventListener("click", () => choose(place));
          cell.append(option);
          const starCell = element(document, "div", "favorite-cell");
          starCell.setAttribute("role", "gridcell");
          const favorite = keys.has(addressKey(place));
          const star = element(
            document,
            "button",
            "favorite-button",
            favorite ? "★" : "☆",
          );
          star.type = "button";
          star.dataset.favoriteKey = addressKey(place);
          star.setAttribute("aria-pressed", String(favorite));
          star.setAttribute(
            "aria-label",
            `${favorite ? "Fjern" : "Gem"} favorit: ${place.label}`,
          );
          star.addEventListener("click", () => {
            const focused = document.activeElement === star;
            star.disabled = true;
            const change = async () => {
              try {
                if (!store?.toggleFavorite)
                  throw new Error("Lokal lagring er ikke tilgængelig.");
                favorites = await store.toggleFavorite(place);
                refreshers.forEach((refresh) => refresh());
                if (focused)
                  options
                    .querySelectorAll("[data-favorite-key]")
                    .forEach((button) => {
                      if (button.dataset.favoriteKey === addressKey(place))
                        button.focus();
                    });
              } catch {
                feedback.textContent =
                  "Favoritten kunne ikke gemmes. Prøv igen.";
              } finally {
                star.disabled = false;
              }
            };
            favoriteQueue = favoriteQueue.then(change, change);
          });
          starCell.append(star);
          row.append(cell, starCell);
          options.append(row);
        }
      }
      if (visible.length) {
        input.setAttribute("aria-expanded", "true");
        highlight(
          activeKey
            ? visible.findIndex((place) => addressKey(place) === activeKey)
            : -1,
        );
      } else {
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        active = -1;
      }
      if (focusedKey)
        options.querySelectorAll("[data-favorite-key]").forEach((button) => {
          if (button.dataset.favoriteKey === focusedKey) button.focus();
        });
      rendering = false;
    }
    refreshers.push(render);
    async function search(query, version, signal) {
      feedback.textContent = "Søger…";
      input.setAttribute("aria-busy", "true");
      try {
        const results = await geocoder.search(query, { signal });
        if (version !== generation || input.value.trim() !== query || !open)
          return;
        places = results;
        render();
        feedback.textContent = results.length
          ? ""
          : "Ingen steder fundet i Danmark. Prøv en anden søgning.";
      } catch (error) {
        if (version === generation && error?.name !== "AbortError")
          feedback.textContent =
            "Adresseopslag virker ikke lige nu. Du kan stadig vælge en favorit.";
      } finally {
        if (version === generation) input.removeAttribute("aria-busy");
      }
    }
    input.addEventListener("focus", () => {
      if (selected[field]) return;
      open = true;
      render();
      void loadingFavorites;
    });
    input.addEventListener("input", () => {
      selected[field] = null;
      showMap();
      generation++;
      clearTimeout(timer);
      controller?.abort();
      input.removeAttribute("aria-busy");
      places = [];
      active = -1;
      open = true;
      feedback.textContent = "";
      render();
      const query = input.value.trim();
      if (query.length < 2 || !geocoder) return;
      controller = new AbortController();
      const version = generation;
      timer = setTimeout(
        () => void search(query, version, controller.signal),
        280,
      );
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dismiss();
        return;
      }
      if (!visible.length || !open) return;
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        highlight(
          event.key === "ArrowDown"
            ? (active + 1) % visible.length
            : active < 0
              ? visible.length - 1
              : (active - 1 + visible.length) % visible.length,
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        choose(visible[active < 0 ? 0 : active]);
      }
    });
    wrapper.addEventListener("pointerdown", () => {
      pointerInside = true;
    });
    wrapper.addEventListener("click", () => {
      pointerInside = false;
    });
    wrapper.addEventListener("pointercancel", () => {
      pointerInside = false;
      if (!wrapper.contains(document.activeElement)) dismiss();
    });
    wrapper.addEventListener("focusout", (event) => {
      if (
        !rendering &&
        !pointerInside &&
        !wrapper.contains(event.relatedTarget)
      )
        dismiss();
    });
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && event.target !== input) {
        input.focus();
        dismiss();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!wrapper.contains(event.target)) {
        pointerInside = false;
        dismiss();
      }
    });
  }
}
