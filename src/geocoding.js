// Replace this adapter when a production geocoding provider is selected.
// Public Nominatim is used only for deliberate, user-triggered searches.
const endpoint = 'https://nominatim.openstreetmap.org/search';
let lastRequest = 0;

export const geocoder = {
  async search(query) {
    const pause = Math.max(0, 1100 - (Date.now() - lastRequest));
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    lastRequest = Date.now();
    const url = new URL(endpoint);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '5');
    url.searchParams.set('accept-language', 'da');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
    return (await response.json()).map((place) => ({
      id: `${place.osm_type}-${place.osm_id}`,
      label: place.display_name,
      coordinates: { latitude: Number(place.lat), longitude: Number(place.lon) },
    }));
  },
};
