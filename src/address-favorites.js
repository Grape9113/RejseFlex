export function addressKey(place) {
  return place.id != null
    ? String(place.id)
    : `${place.coordinates?.latitude},${place.coordinates?.longitude}:${place.label}`;
}
export function validFavorite(place) {
  return (
    typeof place?.label === "string" &&
    place.label.length > 0 &&
    Number.isFinite(place.coordinates?.latitude) &&
    Math.abs(place.coordinates.latitude) <= 90 &&
    Number.isFinite(place.coordinates?.longitude) &&
    Math.abs(place.coordinates.longitude) <= 180
  );
}
