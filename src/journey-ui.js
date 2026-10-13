import { localDateTime } from "./journey-details.js";
export function placeName(place) {
  return place?.label ?? place?.name ?? "Ukendt sted";
}
export function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(document, text, action, className = "secondary-button") {
  const node = element(document, "button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function icon(document, kind) {
  const paths = {
    car: "M3 11l2-6h14l2 6v7h-3v-3H6v3H3zm0 0h18M7 12v1m10-1v1",
    train: "M6 3h12v14H6zM6 10h12M9 17l-2 4m8-4 2 4M9 13h1m4 0h1",
    assistance: "M12 3v4m-5 4 5-4 5 4m-5-4v8m0 0-4 6m4-6 4 6",
    document: "M6 3h8l4 4v14H6zm8 0v5h4M9 12h6m-6 4h6",
    ticket: "M3 6h18v4a2 2 0 000 4v4H3v-4a2 2 0 000-4zm12 0v3m0 2v2m0 2v3",
    self: "M9 5h6m-3 0v8m0-5-5 4m5-4 5 4m-5 1-4 7m4-7 4 7",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("journey-icon");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[kind] ?? paths.document);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.7");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}
export function clock(value) {
  return localDateTime(value).slice(11).replace(":", ".");
}
export function dateLabel(value) {
  const date = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00Z`));
}
