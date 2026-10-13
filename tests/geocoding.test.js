import test from 'node:test';
import assert from 'node:assert/strict';
import { geocoder } from '../src/geocoding.js';

function feature(properties, coordinates = [10.264352, 55.48111]) {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates } };
}
async function search(features, query = 'Sømarksvej 232') {
  const oldFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url) => { requested = new URL(url); return { ok: true, json: async () => ({ features }) }; };
  try { return { places: await geocoder.search(query), requested }; }
  finally { globalThis.fetch = oldFetch; }
}

test('Denmark-filtered search formats a regular Danish address from structured fields', async () => {
  const { places, requested } = await search([feature({ osm_type: 'N', osm_id: 1, street: 'Sømarksvej', housenumber: '232', postcode: '5471', city: 'Søndersø', locality: 'Mosegravene', state: 'Region Syddanmark', countrycode: 'DK' })]);
  assert.equal(requested.searchParams.get('countrycode'), 'DK');
  assert.equal(places[0].label, 'Sømarksvej 232, 5471 Søndersø');
  assert.deepEqual(places[0].coordinates, { latitude: 55.48111, longitude: 10.264352 });
});

test('named place shows name with available address and excludes other countries', async () => {
  const { places } = await search([
    feature({ osm_type: 'W', osm_id: 2, name: 'Egmont Højskolen', street: 'Villavej', housenumber: '25', postcode: '8300', city: 'Odder', countrycode: 'DK' }),
    feature({ osm_type: 'W', osm_id: 3, name: 'Egmont Højskolen', city: 'Malmö', countrycode: 'SE' }),
  ], 'Egmont Højskolen');
  assert.equal(places.length, 1);
  assert.equal(places[0].label, 'Egmont Højskolen, Villavej 25, 8300 Odder');
  assert.equal(places[0].primary, 'Egmont Højskolen');
  assert.equal(places[0].secondary, 'Villavej 25, 8300 Odder');
});

test('partial provider records remain concise and invalid coordinates are omitted', async () => {
  const { places } = await search([
    feature({ osm_type: 'W', osm_id: 4, name: 'Dokk1', postcode: '8000', city: 'Aarhus', countrycode: 'DK' }),
    feature({ osm_type: 'N', osm_id: 5, name: 'Broken', countrycode: 'DK' }, [null, 55]),
    feature({ osm_type: 'N', osm_id: 6, street: 'Villavej', countrycode: 'DK' }),
  ]);
  assert.deepEqual(places.map((item) => item.label), ['Dokk1, 8000 Aarhus', 'Villavej']);
});

test('duplicate OSM features with the same user-facing place and address appear once', async () => {
  const details = { name: 'Dokk1', street: 'Havnegade', postcode: '8000', city: 'Aarhus', countrycode: 'DK' };
  const { places } = await search([
    feature({ ...details, osm_type: 'W', osm_id: 10 }),
    feature({ ...details, osm_type: 'W', osm_id: 11 }),
  ], 'Dokk1');
  assert.deepEqual(places.map((item) => item.label), ['Dokk1, Havnegade, 8000 Aarhus']);
});
