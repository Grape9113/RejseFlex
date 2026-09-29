// Published ordinary tariffs. A fare is always based on the user's visiting provider.
export const handicapTariffs = Object.freeze({
  MOVIA: { source: 'https://moviatrafik.dk/flexkunde/flexhandicap/priser-og-betaling', lastVerified: '2026-09-29', onlineDiscount: 0 },
  MIDTTRAFIK: { source: 'https://midttrafik.dk/flextrafik/handicapkoersel/ture-under-100-km/', lastVerified: '2026-09-29', onlineDiscount: 0 },
  FYNBUS: { source: 'https://fynbus.dk/flextrafik/handicapkoersel', lastVerified: '2026-09-29', onlineDiscount: 0.2 },
  SYDTRAFIK: { source: 'https://sydtrafik.dk/flextrafik/handicapkoersel', lastVerified: '2026-09-29', onlineDiscount: 0.2 },
  NT: { source: 'https://www.ntrejse.dk/nyheder/2026/jan/nye-priser-2026', lastVerified: '2026-09-29', onlineDiscount: 0 },
});

const roundOre = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function calculateHandicapFare({ provider, distanceKm, discountEligible = false }) {
  const tariff = handicapTariffs[provider];
  if (!tariff) throw new Error('Vælg et gyldigt trafikselskab for handicapkørsel.');
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error('En gyldig vejafstand kræves for prisoverslag.');
  let normalPrice;
  switch (provider) {
    case 'MOVIA': {
      const km = Math.round(distanceKm);
      normalPrice = km <= 5 ? 31 : km <= 40 ? 31 + (km - 5) * 3.14 : 31 + 35 * 3.14 + (km - 40) * 1.46;
      break;
    }
    case 'MIDTTRAFIK': normalPrice = distanceKm <= 100 ? Math.max(46, distanceKm * 5) : 500 + (distanceKm - 100) * 15; break;
    case 'FYNBUS': normalPrice = Math.min(170, distanceKm <= 10 ? 48 : 48 + (distanceKm - 10) * 4.5); break;
    case 'SYDTRAFIK': normalPrice = Math.max(50, distanceKm * 4.5); break;
    case 'NT': normalPrice = Math.max(50, distanceKm * 5); break;
  }
  const discountApplied = Boolean(discountEligible && tariff.onlineDiscount);
  return {
    estimatedPrice: roundOre(normalPrice * (discountApplied ? 1 - tariff.onlineDiscount : 1)),
    normalPrice: roundOre(normalPrice), discountApplied,
    discountType: discountApplied ? 'ONLINE_BOOKING' : null,
    currency: 'DKK', distanceKm, source: tariff.source, lastVerified: tariff.lastVerified,
  };
}
