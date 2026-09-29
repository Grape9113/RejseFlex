import { element } from './journey-view.js';

export function bindAddressSearch(root, selected, geocoder, map) {
  const document = root.ownerDocument;
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
}
