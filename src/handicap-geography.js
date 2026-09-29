// DAWA classifies the two ends of a leg; geography never selects the fare tariff.
const fynbusMunicipalities = new Set(['0410', '0420', '0430', '0440', '0450', '0461', '0479', '0480', '0482']);
const sydtrafikMunicipalities = new Set(['0510', '0530', '0540', '0550', '0561', '0573', '0575', '0580', '0607', '0621', '0630']);
export function areaFromMunicipality({ kode, regionskode } = {}) {
  if (kode === '0400') return null; // Bornholm has a separate transport authority.
  if (fynbusMunicipalities.has(kode)) return 'FYNBUS';
  if (sydtrafikMunicipalities.has(kode)) return 'SYDTRAFIK';
  return ({ '1081': 'NT', '1082': 'MIDTTRAFIK', '1084': 'MOVIA', '1085': 'MOVIA' })[regionskode] ?? null;
}

export function createAreaSource(fetcher = fetch) {
  return {
    async classify(coordinates) {
      if (!Number.isFinite(coordinates?.longitude) || !Number.isFinite(coordinates?.latitude)) return { kind: 'unknown' };
      try {
        const url = new URL('https://api.dataforsyningen.dk/kommuner/reverse');
        url.searchParams.set('x', coordinates.longitude);
        url.searchParams.set('y', coordinates.latitude);
        url.searchParams.set('struktur', 'mini');
        const response = await fetcher(url);
        if (!response.ok) return { kind: 'unknown' };
        const municipality = await response.json();
        const area = areaFromMunicipality(municipality);
        return area ? { kind: 'known', area, region: municipality.regionskode, municipality: municipality.kode } : { kind: 'unknown' };
      } catch { return { kind: 'unknown' }; }
    },
  };
}

export function classifyTripGeography(origin, destination, homeProvider) {
  if (origin?.kind !== 'known' || destination?.kind !== 'known') return { kind: 'UNKNOWN' };
  if (origin.area !== destination.area) return { kind: 'CROSS_AREA', fromArea: origin.area, toArea: destination.area };
  return { kind: origin.area === homeProvider ? 'WITHIN_HOME_AREA' : 'WITHIN_OTHER_AREA', area: origin.area, region: origin.region };
}
