import L from "leaflet";

export function mountMap(container) {
  const map = L.map(container, {
    scrollWheelZoom: false,
    zoomControl: false,
  }).setView([56.1, 10.2], 7);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 19,
  }).addTo(map);
  let markers = [];
  return {
    resize() {
      map.invalidateSize();
    },
    show(places, { roles = [] } = {}) {
      markers.forEach((marker) => marker.remove());
      markers = places
        .filter((place) => place.coordinates)
        .map((place, index) => {
          const destination = roles[index] === "to";
          const title = destination ? "Destination" : "Afgang";
          const icon = L.divIcon({
            className: `journey-marker ${destination ? "marker-destination" : "marker-origin"}`,
            html: `<span aria-hidden="true">${destination ? "B" : "A"}</span>`,
            iconSize: [36, 44],
            iconAnchor: [18, 44],
            popupAnchor: [0, -40],
          });
          const popup = container.ownerDocument.createElement("div");
          popup.textContent = `${title} · ${place.label}`;
          return L.marker(
            [place.coordinates.latitude, place.coordinates.longitude],
            { icon, title: `${title}: ${place.label}`, alt: title },
          )
            .addTo(map)
            .bindPopup(popup);
        });
      if (markers.length === 1) map.setView(markers[0].getLatLng(), 13);
      if (markers.length > 1)
        map.fitBounds(L.featureGroup(markers).getBounds().pad(0.25));
      map.invalidateSize();
    },
  };
}
