import { calculateHandicapFare } from './handicap-fare.js';

const bookingRules = {
  MOVIA: { homeDigital: true, southDigital: false, source: 'https://moviatrafik.dk/flexkunde/flexhandicap/bestilling' },
  MIDTTRAFIK: { homeDigital: true, southDigital: true, source: 'https://www.midttrafik.dk/flextrafik/handicapkoersel/ture-i-andre-regioner/' },
  FYNBUS: { homeDigital: true, southDigital: true, source: 'https://fynbus.dk/flextrafik/handicapkoersel' },
  SYDTRAFIK: { homeDigital: true, southDigital: true, source: 'https://sydtrafik.dk/flextrafik/handicapkoersel' },
  NT: { homeDigital: false, southDigital: false, source: 'https://www.ntrejse.dk/kundeservice' },
};

export function getHandicapBookingInstruction({ provider, tripGeography, journeyContext = 'LOCAL' }) {
  const rule = bookingRules[provider];
  if (!rule) return { method: 'UNKNOWN', actionType: 'MANUAL_BOOKING_REQUIRED', discountEligible: false, source: null };
  const kind = tripGeography?.kind ?? 'UNKNOWN';
  let actionType;
  if (kind === 'UNKNOWN' || journeyContext === 'UNKNOWN') actionType = 'MANUAL_BOOKING_REQUIRED';
  else if (journeyContext === 'NATIONAL_TRAIN_COMBINATION') actionType = 'CALL_FOR_CROSS_REGION_BOOKING';
  else if (kind === 'CROSS_AREA') actionType = 'CALL_FOR_CROSS_REGION_BOOKING';
  else if (kind === 'WITHIN_HOME_AREA' && rule.homeDigital) actionType = 'BOOK_DIGITALLY';
  else if (kind === 'WITHIN_OTHER_AREA' && tripGeography.region === '1083' && rule.southDigital && provider === 'MIDTTRAFIK') actionType = 'BOOK_DIGITALLY';
  else if (kind === 'WITHIN_OTHER_AREA' && tripGeography.region === '1083' && rule.southDigital && provider === 'FYNBUS') actionType = 'BOOK_DIGITALLY';
  else actionType = 'CALL_HOME_PROVIDER';
  const discountEligible = actionType === 'BOOK_DIGITALLY' && ['FYNBUS', 'SYDTRAFIK'].includes(provider);
  return { method: actionType === 'BOOK_DIGITALLY' ? 'SELF_SERVICE' : actionType === 'MANUAL_BOOKING_REQUIRED' ? 'UNKNOWN' : 'PHONE', actionType, discountEligible, source: rule.source };
}

export function resolveHandicapTrip({ provider, distanceKm, tripGeography, journeyContext = 'LOCAL' }) {
  if (!provider) return { kind: 'PROVIDER_REQUIRED' };
  const booking = getHandicapBookingInstruction({ provider, tripGeography, journeyContext });
  return { kind: 'KNOWN', provider, booking, fare: Number.isFinite(distanceKm) ? calculateHandicapFare({ provider, distanceKm, discountEligible: booking.discountEligible }) : null };
}
