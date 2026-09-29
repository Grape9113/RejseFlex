import L from 'leaflet';

export function mountMap(container) {
  const map = L.map(container, { scrollWheelZoom: false }).setView([56.1, 10.2], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 19,
  }).addTo(map);
  let markers = [];
  return {
    show(places) {
      markers.forEach((marker) => marker.remove());
      markers = places.map((place) => L.marker([place.coordinates.latitude, place.coordinates.longitude]).addTo(map).bindPopup(place.label));
      if (markers.length === 1) map.setView(markers[0].getLatLng(), 13);
      if (markers.length > 1) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.25));
      map.invalidateSize();
    },
  };
}
