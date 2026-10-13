const routeEndpoint = 'https://router.project-osrm.org/route/v1/driving';
let earliestRequest = 0;
let requestQueue = Promise.resolve();
export function createRoadDistanceSource(fetcher = fetch) {
  return {
    distanceKm(origin, destination) {
      if (![origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude].every(Number.isFinite)) return Promise.resolve(null);
      const request = async () => {
        const wait = Math.max(0, earliestRequest - Date.now());
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        earliestRequest = Date.now() + 1100;
        const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
        try {
          const response = await fetcher(`${routeEndpoint}/${coordinates}?overview=false&steps=false`);
          if (!response.ok) return null;
          const data = await response.json();
          const metres = data.routes?.[0]?.distance;
          return Number.isFinite(metres) && metres >= 0 ? metres / 1000 : null;
        } catch { return null; }
      };
      const result = requestQueue.then(request);
      requestQueue = result.then(() => undefined);
      return result;
    },
  };
}
