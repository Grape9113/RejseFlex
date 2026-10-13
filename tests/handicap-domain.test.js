import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHandicapFare } from '../src/handicap-fare.js';
import { getHandicapBookingInstruction, resolveHandicapTrip } from '../src/handicap-booking.js';

test('takster ved grænser og rabat', () => {
  const fare = (provider, distanceKm, discountEligible = false) => calculateHandicapFare({ provider, distanceKm, discountEligible });
  assert.equal(fare('MOVIA', 5).estimatedPrice, 31);
  assert.equal(fare('MOVIA', 40).estimatedPrice, 140.9);
  assert.equal(fare('MOVIA', 50).estimatedPrice, 155.5);
  assert.equal(fare('MIDTTRAFIK', 1).estimatedPrice, 46);
  assert.equal(fare('MIDTTRAFIK', 100).estimatedPrice, 500);
  assert.equal(fare('MIDTTRAFIK', 101).estimatedPrice, 515);
  assert.equal(fare('FYNBUS', 10).estimatedPrice, 48);
  assert.equal(fare('FYNBUS', 100).normalPrice, 170);
  assert.equal(fare('FYNBUS', 20, true).estimatedPrice, 74.4);
  assert.equal(fare('SYDTRAFIK', 1).estimatedPrice, 50);
  assert.equal(fare('SYDTRAFIK', 20, true).estimatedPrice, 72);
  assert.equal(fare('NT', 1).estimatedPrice, 50);
  for (const provider of ['MOVIA', 'MIDTTRAFIK', 'NT']) assert.equal(fare(provider, 20, true).discountApplied, false);
});

test('booking og takst følger hver sin beslutning', () => {
  const geography = { kind: 'WITHIN_OTHER_AREA', area: 'MIDTTRAFIK' };
  const fynbus = resolveHandicapTrip({ provider: 'FYNBUS', distanceKm: 20, tripGeography: geography, journeyContext: 'LOCAL' });
  assert.equal(fynbus.fare.normalPrice, 93);
  assert.equal(fynbus.booking.actionType, 'CALL_HOME_PROVIDER');
  assert.equal(fynbus.fare.discountApplied, false);
  const midt = resolveHandicapTrip({ provider: 'MIDTTRAFIK', distanceKm: 20, tripGeography: geography, journeyContext: 'LOCAL' });
  assert.equal(midt.fare.estimatedPrice, 100);
  assert.notEqual(fynbus.fare.estimatedPrice, midt.fare.estimatedPrice);
  assert.equal(resolveHandicapTrip({ provider: null, distanceKm: 20, tripGeography: geography }).kind, 'PROVIDER_REQUIRED');
});

test('digital rabat kræver kvalificerende konkret booking', () => {
  for (const provider of ['FYNBUS', 'SYDTRAFIK']) {
    const local = resolveHandicapTrip({ provider, distanceKm: 20, tripGeography: { kind: 'WITHIN_HOME_AREA', area: provider }, journeyContext: 'LOCAL' });
    assert.equal(local.booking.actionType, 'BOOK_DIGITALLY');
    assert.equal(local.fare.discountApplied, true);
    const train = resolveHandicapTrip({ provider, distanceKm: 20, tripGeography: { kind: 'WITHIN_HOME_AREA', area: provider }, journeyContext: 'NATIONAL_TRAIN_COMBINATION' });
    assert.equal(train.booking.actionType, 'CALL_FOR_CROSS_REGION_BOOKING');
    assert.equal(train.fare.discountApplied, false);
  }
  assert.equal(getHandicapBookingInstruction({ provider: 'NT', tripGeography: { kind: 'UNKNOWN' } }).discountEligible, false);
});

test('Midttrafik kan bruge digital booking på intern tur i Region Syddanmark uden prisrabat', () => {
  const booking = getHandicapBookingInstruction({ provider: 'MIDTTRAFIK', tripGeography: { kind: 'WITHIN_OTHER_AREA', area: 'FYNBUS', region: '1083' } });
  assert.equal(booking.actionType, 'BOOK_DIGITALLY');
  assert.equal(booking.discountEligible, false);
  assert.equal(calculateHandicapFare({ provider: 'MIDTTRAFIK', distanceKm: 20, discountEligible: booking.discountEligible }).estimatedPrice, 100);
});
