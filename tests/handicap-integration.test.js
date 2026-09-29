import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as memoryDb } from 'fake-indexeddb';
import { createJourneyStore } from '../src/journey-store.js';
import { proposeJourney } from '../src/journey.js';
import { areaFromMunicipality, classifyTripGeography, createAreaSource } from '../src/handicap-geography.js';
import { createRoadDistanceSource } from '../src/road-distance.js';
import { createStationSource } from '../src/station-source.js';

const point = (longitude, latitude) => ({ longitude, latitude });
const places = {
  from: { label: 'Søndersø', coordinates: point(10.257, 55.482) },
  to: { label: 'Dokk1', coordinates: point(10.214, 56.153) },
};
const trainSource = { async findConnections() { return [{ id: 'demo', fromStation: { id: 'odense', name: 'Odense', coordinates: point(10.386, 55.402) }, toStation: { id: 'aarhus', name: 'Aarhus H', coordinates: point(10.204, 56.150) }, plannedDeparture: '2026-10-02T10:00:00Z', plannedArrival: '2026-10-02T12:00:00Z' }]; } };
const area = (area, region) => ({ kind: 'known', area, region });
const areaSource = { async classify(coordinates) { return coordinates.latitude < 56 ? area('FYNBUS', '1083') : area('MIDTTRAFIK', '1082'); } };

test('trafikselskab gemmes lokalt mellem instanser', async () => {
  const first = createJourneyStore(memoryDb);
  assert.equal(await first.getHandicapProvider(), null);
  await first.setHandicapProvider('FYNBUS');
  assert.equal(await createJourneyStore(memoryDb).getHandicapProvider(), 'FYNBUS');
});

test('samlet rejse bruger valgt takst og telefon ved landsdækkende togkombination', async () => {
  const plan = await proposeJourney({ ...places, arrival: '2026-10-02T14:00', timeMode: 'arrival' }, {
    trainSource, trafficAreaSource: areaSource, roadDistanceSource: { distanceKm: async () => 20 }, handicapProvider: 'FYNBUS',
  });
  for (const leg of [plan.legs[0], plan.legs[2]]) {
    assert.equal(leg.handicapTrip.provider, 'FYNBUS');
    assert.equal(leg.priceEstimate.estimatedPrice, 93);
    assert.equal(leg.handicapTrip.booking.actionType, 'CALL_FOR_CROSS_REGION_BOOKING');
    assert.equal(leg.priceEstimate.discountApplied, false);
  }
  assert.equal(plan.nextAction.actionType, 'CALL_FOR_CROSS_REGION_BOOKING');
});

test('områder bruger kommune, men gætter ikke takst ud fra geografi', () => {
  assert.equal(areaFromMunicipality({ kode: '0480', regionskode: '1083' }), 'FYNBUS');
  assert.equal(areaFromMunicipality({ kode: '0630', regionskode: '1083' }), 'SYDTRAFIK');
  assert.equal(areaFromMunicipality({ kode: '0492', regionskode: '1083' }), null);
  assert.equal(classifyTripGeography(area('MIDTTRAFIK', '1082'), area('MIDTTRAFIK', '1082'), 'FYNBUS').kind, 'WITHIN_OTHER_AREA');
});

test('afstandskilde bruger bilrute i meter og vender ikke tilbage til luftlinje ved fejl', async () => {
  const source = createRoadDistanceSource(async () => ({ ok: true, json: async () => ({ routes: [{ distance: 14440.9 }] }) }));
  assert.equal(await source.distanceKm(point(10.2, 56.1), point(10.3, 56.2)), 14.4409);
  assert.equal(await createRoadDistanceSource(async () => { throw Error('offline'); }).distanceKm(point(10.2, 56.1), point(10.3, 56.2)), null);
});

test('områder og stationer afviser ufuldstændige svar', async () => {
  assert.deepEqual(await createAreaSource(async () => ({ ok: true, json: async () => ({ kode: '0492', regionskode: '1083' }) })).classify(point(10, 55)), { kind: 'unknown' });
  assert.equal(await createStationSource(async () => ({ ok: true, json: async () => ({ features: [{ properties: { countrycode: 'DE', name: 'Station' }, geometry: { coordinates: [10, 55] } }] }) })).nearby(point(10, 55)), null);
});

test('ændret togstation efter oplyst afhentning giver konflikt i stedet for gammel pris som sikker plan', async () => {
  const wish = { ...places, arrival: '2026-10-02T14:00', timeMode: 'arrival' };
  const plan = await proposeJourney(wish, { trainSource, trafficAreaSource: areaSource, roadDistanceSource: { distanceKm: async () => 20 }, handicapProvider: 'FYNBUS' });
  const { recordBookingTime } = await import('../src/journey.js');
  const changedSource = { async findConnections() { return [{ ...((await trainSource.findConnections())[0]), fromStation: { id: 'ny-station', name: 'Ny station', coordinates: point(10.5, 55.5) } }]; } };
  const changed = await recordBookingTime(plan, 'inbound', '2026-10-02T15:00', { trainSource: changedSource });
  assert.equal(changed.feasibility, 'konflikt');
  assert.equal(changed.conflicts[0].code, 'train-station-changed');
  assert.equal(changed.legs[0].to.id, 'odense');
});

test('visningen viser konkret telefonboks og pris uden digital rabat', async () => {
  const { JSDOM } = await import('jsdom');
  const { renderJourney } = await import('../src/journey-view.js');
  const plan = await proposeJourney({ ...places, arrival: '2026-10-02T14:00', timeMode: 'arrival' }, {
    trainSource, trafficAreaSource: areaSource, roadDistanceSource: { distanceKm: async () => 20 }, handicapProvider: 'FYNBUS',
  });
  const dom = new JSDOM('<div id="app"><section id="result"></section></div>');
  const root = dom.window.document.querySelector('#app');
  renderJourney(root, plan, () => {}, () => {});
  assert.equal(root.querySelector('[data-next-action]').dataset.bookingAction, 'CALL_FOR_CROSS_REGION_BOOKING');
  assert.match(root.querySelector('#result').textContent, /ca\. 93 kr/);
  assert.doesNotMatch(root.querySelector('#result').textContent, /ved onlinebestilling/);
});
