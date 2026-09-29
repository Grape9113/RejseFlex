import { element } from './journey-view.js';

// geocoder.search(query, { signal }) returns compact places with label and coordinates.
export function bindAddressSearch(root, selected, geocoder, map) {
  const document = root.ownerDocument;
  for (const field of ['from', 'to']) {
    const input = root.querySelector(`[name="${field}"]`);
    const feedback = root.querySelector(`[data-feedback="${field}"]`);
    const options = root.querySelector(`[data-options="${field}"]`);
    let timer;
    let controller;
    let generation = 0;
    let active = -1;
    const optionId = (index) => `${field}-option-${index}`;
    function close() {
      options.replaceChildren();
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function highlight(index) {
      const buttons = [...options.querySelectorAll('button')];
      active = index;
      buttons.forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
      if (index >= 0) {
        input.setAttribute('aria-activedescendant', optionId(index));
        buttons[index]?.scrollIntoView?.({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    function choose(place) {
      selected[field] = place;
      input.value = place.label;
      close();
      feedback.textContent = '';
      map?.show(Object.values(selected).filter(Boolean));
    }
    async function search(query, version, signal) {
      feedback.textContent = 'Søger…';
      input.setAttribute('aria-busy', 'true');
      try {
        const places = await geocoder.search(query, { signal });
        if (version !== generation || input.value.trim() !== query) return;
        close();
        if (!places.length) feedback.textContent = 'Ingen steder fundet i Danmark. Prøv en anden søgning.';
        else {
          feedback.textContent = '';
          places.forEach((place, index) => {
            const option = element(document, 'button', 'place-option');
            option.type = 'button';
            option.id = optionId(index);
            option.role = 'option';
            option.dataset.placeOption = field;
            option.setAttribute('aria-selected', 'false');
            option.append(element(document, 'strong', '', place.primary ?? place.label));
            if (place.secondary) option.append(element(document, 'span', '', place.secondary));
            option.addEventListener('click', () => choose(place));
            options.append(option);
          });
          input.setAttribute('aria-expanded', 'true');
        }
      } catch (error) {
        if (version === generation && error?.name !== 'AbortError') feedback.textContent = 'Adresseopslag virker ikke lige nu. Prøv igen senere.';
      } finally {
        if (version === generation) input.removeAttribute('aria-busy');
      }
    }
    input.addEventListener('input', () => {
      selected[field] = null;
      map?.show(Object.values(selected).filter(Boolean));
      generation += 1;
      clearTimeout(timer);
      controller?.abort();
      close();
      feedback.textContent = '';
      const query = input.value.trim();
      if (query.length < 2 || !geocoder) return;
      controller = new AbortController();
      const version = generation;
      timer = setTimeout(() => void search(query, version, controller.signal), 280);
    });
    input.addEventListener('keydown', (event) => {
      const buttons = [...options.querySelectorAll('button')];
      if (event.key === 'Escape') { generation += 1; clearTimeout(timer); controller?.abort(); close(); input.removeAttribute('aria-busy'); return; }
      if (!buttons.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        highlight(event.key === 'ArrowDown' ? (active + 1) % buttons.length : (active < 0 ? buttons.length - 1 : (active - 1 + buttons.length) % buttons.length));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        buttons[active < 0 ? 0 : active].click();
      }
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
  }
}
