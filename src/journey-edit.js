import {
  withJourneyDetails,
  confirmBooking,
  confirmTrainChoice,
  confirmAssistance,
} from "./journey.js";
import {
  withMeetingInterval,
  withManualPrice,
  copenhagenInstant,
} from "./journey-details.js";

// One domain update for a complete editing draft, without writing to storage.
export function applyJourneyEdit(plan, values) {
  let updated = withJourneyDetails(plan, values);
  updated = withMeetingInterval(updated, values.interval);
  for (const id of ["outbound", "train", "inbound"]) {
    if (!values.selfManaged[id] || values.prices[id])
      updated = withManualPrice(updated, id, values.prices[id]);
    if (values.selfManaged[id] && values.times[id]) {
      const time = copenhagenInstant(values.times[id]);
      updated.tasks.find((task) => task.id === id).actualBookingTime = time;
      updated.legs.find((leg) => leg.id === id).actualBookingTime = time;
    }
  }
  if (![null, "dsb", "rejsekort"].includes(values.ticketType ?? null))
    throw new Error("Vælg DSB eller Rejsekort.");
  updated.ticketType = values.ticketType ?? null;
  if (values.dateOverrides)
    updated.timeDateOverrides = { ...values.dateOverrides };
  for (const action of values.confirmations ?? []) {
    updated =
      action === "train"
        ? confirmTrainChoice(updated)
        : action === "assistance"
          ? confirmAssistance(updated)
          : confirmBooking(updated, action);
  }
  return updated;
}
