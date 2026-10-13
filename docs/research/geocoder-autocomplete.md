# Autocomplete geocoder for RejseFlex

Checked 29 September 2026 against providers' own documentation. Decision: use **Komoot Photon** for the current low-traffic static demo, because its keyless public endpoint lets the GitHub Pages app work immediately. **Geoapify Address Autocomplete** is the preferred hosted replacement when a browser key and a reliability requirement are in place.

### Keyless interim option

The public [Komoot Photon demo API](https://github.com/komoot/photon/blob/master/README.md) explicitly supports search-as-you-type and allows projects with a reasonable number of requests, with throttling or bans for extensive use. Its [API reference](https://github.com/komoot/photon/blob/master/docs/api-v1.md) supports a hard `countrycode=DK` restriction and returns GeoJSON with OSM place/address properties. A maintainer says a homepage search box is unlikely to cause trouble at modest usage ([discussion](https://github.com/komoot/photon/discussions/822)). It requires no account or browser key and can make the current Pages app usable immediately. However, Komoot calls this a demo service with no uptime guarantee; the maintainer warns that production apps with sensitive address data should use a private instance ([discussion](https://github.com/komoot/photon/discussions/539)). Treat it as a temporary fallback, with visible failure handling, short debounce, and no stored-query transmission. The endpoint is `https://photon.komoot.io/api?q=...&countrycode=DK&limit=5`. Photon currently rejects `lang=da`; use its default names and build Danish-facing labels from structured fields. Live test queries on 29 September 2026 returned named results for *Egmont Højskolen* and *Dokk1* and a numbered result for *Sømarksvej 232, Søndersø*. Some named results lack a house number, so the UI must not invent one.

## Why Geoapify

- Its dedicated [autocomplete endpoint](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/) expressly supports partial address or place queries. Results have structured `name`, `street`, `housenumber`, `postcode`, `city`, `country_code`, `lat`, and `lon` fields, allowing RejseFlex to construct concise Danish labels rather than showing `formatted` verbatim. An amenity result type exists; actual coverage and ranking for *Egmont Højskolen* and *Dokk1* still need testing with a real key.
- `filter=countrycode:dk` is a [hard country restriction](https://apidocs.geoapify.com/how-to/addresses/restrict-address-search-country/), unlike country bias. Also set `lang=da`, a short debounce, a result limit, and abort superseded requests. Check `country_code === "dk"` before presenting results as defense in depth.
- [Free plan](https://www.geoapify.com/pricing/): 3,000 credits per day, up to 5 requests per second, no credit card; an autocomplete request is [one credit](https://www.geoapify.com/address-autocomplete/). Attribution to Geoapify and underlying data sources is required. The [API docs](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/) describe protecting a browser key with allowed HTTP referrers, origins, and CORS. Create a project key, restrict it to the deployed GitHub Pages origin (and any necessary development origin), and show attribution in the UI.
- The key is inherently visible in a static browser app; referrer/origin restrictions limit abuse but are not equivalent to a secret. Do not commit a private key or use a privileged account key. Project setup is needed to obtain and configure the browser key.

Suggested endpoint: `GET https://api.geoapify.com/v1/geocode/autocomplete?text=...&filter=countrycode:dk&lang=da&limit=5&format=json&apiKey=...` ([reference](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)). Keep the endpoint and response mapping inside one service; pass only compact app-specific suggestions to the UI.

## Alternatives reviewed

| Provider | Relevant facts | Assessment |
| --- | --- | --- |
| [LocationIQ](https://docs.locationiq.com/docs/autocomplete) | Dedicated predictive/typeahead API and `countrycodes=dk`. [Free plan](https://locationiq.com/pricing) lists 5,000 requests/day, 2 requests/second, 60 requests/minute, one token, HTTP restrictions, and required attribution. | Viable fallback. Geoapify's documented structured fields and origin/CORS restrictions make the first integration simpler to verify. |
| [Mapbox Search Box](https://docs.mapbox.com/api/search/search-box/) | Strong POI autocomplete with `country=DK`; suggestions require a second retrieve request for coordinates. Mapbox explicitly says Search Box data is available for **temporary use only**. | Avoid for locally persisted journey locations unless Mapbox grants appropriate storage rights. |
| [MapTiler Geocoding](https://docs.maptiler.com/cloud/api/geocoding/) | Forward search supports POI queries. [Cloud terms](https://www.maptiler.com/terms/cloud/) limit its free plan to noncommercial use and research/development of commercial products. | Possible, but no clear advantage over Geoapify for this use case. |

## Verification still required

Use a real restricted Geoapify key to test `Egmont Højskolen`, `Dokk1`, a station name, and `Sømarksvej 232, Søndersø` from the deployed origin. Check precision of coordinates and structured address components. If POI quality is insufficient, switch the small service to LocationIQ or another provider; do not silently substitute a nearby road address for a named venue.
