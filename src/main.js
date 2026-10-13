import './styles.css';
import 'leaflet/dist/leaflet.css';
import { mountApp } from './app.js';
import { geocoder } from './geocoding.js';
import { createDemoTrainSource } from './journey.js';
import { createStationSource } from './station-source.js';
import { createAreaSource } from './handicap-geography.js';
import { createRoadDistanceSource } from './road-distance.js';
import { mountMap } from './map.js';

const root = document.querySelector('#app');
mountApp(root, { geocoder, mapFactory: mountMap, trainSource: createDemoTrainSource({ stationSource: createStationSource() }), trafficAreaSource: createAreaSource(), roadDistanceSource: createRoadDistanceSource() });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // The app remains usable online if offline support is unavailable.
    });
  });
}
