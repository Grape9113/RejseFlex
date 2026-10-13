// Real station coordinates for the illustrative train link. The train schedule remains a demo.
export function createStationSource(fetcher = fetch) {
  return {
    async nearby(coordinates) {
      if (!coordinates) return null;
      const url = new URL('https://photon.komoot.io/reverse');
      url.searchParams.set('lat', coordinates.latitude);
      url.searchParams.set('lon', coordinates.longitude);
      url.searchParams.set('osm_tag', 'railway:station');
      url.searchParams.set('radius', '50000');
      url.searchParams.set('limit', '10');
      try {
        const response = await fetcher(url);
        if (!response.ok) return null;
        const data = await response.json();
        const feature = data.features?.find((item) => item.properties?.countrycode?.toUpperCase() === 'DK' && item.properties?.name && item.geometry?.coordinates?.every(Number.isFinite));
        if (!feature) return null;
        const [longitude, latitude] = feature.geometry.coordinates;
        return { id: `osm-${feature.properties.osm_id}`, name: feature.properties.name, coordinates: { longitude, latitude } };
      } catch { return null; }
    },
  };
}
