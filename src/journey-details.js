// User-owned details are independent of calculated fares and booking readiness.
const stageIds = ["outbound", "train", "inbound"];
export function withManualPrice(plan, stageId, value) {
  if (!stageIds.includes(stageId)) throw new Error("Ukendt rejseben.");
  const updated = structuredClone(plan);
  updated.manualPrices = { ...plan.manualPrices };
  if (value === "" || value === null) delete updated.manualPrices[stageId];
  else {
    const text = String(value).trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(text))
      throw new Error("Angiv en pris i kroner, fx 125,50.");
    const cents = Math.round(Number(text.replace(",", ".")) * 100);
    if (!Number.isSafeInteger(cents) || cents > 100_000_000)
      throw new Error("Prisen er for stor.");
    updated.manualPrices[stageId] = cents;
  }
  return updated;
}
export function priceSummary(plan) {
  const values = stageIds
    .map((id) => plan.manualPrices?.[id])
    .filter((value) => Number.isSafeInteger(value) && value >= 0);
  return values.length
    ? {
        cents: values.reduce((a, b) => a + b, 0),
        complete: values.length === 3,
      }
    : null;
}
export function money(cents) {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
  }).format(cents / 100);
}
export function withMeetingInterval(plan, minutes) {
  if (![15, 30].includes(minutes))
    throw new Error("Vælg 15 eller 30 minutter.");
  return { ...plan, assistanceInterval: minutes };
}
export function meetingTime(plan) {
  const assistance = plan.tasks.find((task) => task.id === "assistance");
  const departure =
    assistance?.confirmed && !plan.manualTrainTimes
      ? assistance.trainIdentity?.plannedDeparture
      : plan.legs[1].plannedDeparture;
  const timestamp = Date.parse(departure);
  return Number.isFinite(timestamp)
    ? new Date(
        timestamp - (plan.assistanceInterval === 30 ? 30 : 15) * 60_000,
      ).toISOString()
    : null;
}
export function localDateTime(value) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  // datetime-local must show Copenhagen wall time even when the stored value is UTC.
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return parts.replace(" ", "T");
}
export function copenhagenInstant(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Angiv en gyldig dato og tid.");
  const guess = Date.parse(`${value}Z`);
  for (const offset of [120, 60]) {
    const candidate = new Date(guess - offset * 60_000).toISOString();
    if (localDateTime(candidate) === value) return candidate;
  }
  throw new Error(
    "Tidspunktet findes ikke i dansk sommertid. Vælg et andet tidspunkt.",
  );
}
