// Replaceable address-search adapter. Photon permits low-traffic search-as-you-type.
const endpoint = 'https://photon.komoot.io/api';

function placeFromFeature(feature) {
  const p = feature?.properties ?? {};
  const [longitude, latitude] = feature?.geometry?.coordinates ?? [];
  if (String(p.countrycode).toUpperCase() !== 'DK' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const town = [p.postcode, p.city ?? p.town ?? p.village].filter(Boolean).join(' ');
  const address = [street, town].filter(Boolean).join(', ');
  const name = p.name?.trim();
  const primary = name || street || town;
  if (!primary) return null;
  const secondary = name ? address : street && town ? town : '';
  const label = name && address ? `${name}, ${address}` : name || address || primary;
  return {
    id: `${p.osm_type ?? 'place'}-${p.osm_id ?? `${latitude}-${longitude}`}`,
    label, primary, secondary,
    coordinates: { latitude, longitude },
  };
}

export const geocoder = {
  async search(query, { signal } = {}) {
    const url = new URL(endpoint);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('countrycode', 'DK');
    url.searchParams.set('limit', '5');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
    const data = await response.json();
    const seen = new Set();
    return (data.features ?? []).map(placeFromFeature).filter((place) => {
      if (!place || seen.has(place.label)) return false;
      seen.add(place.label);
      return true;
    });
  },
};
