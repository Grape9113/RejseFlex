import './styles.css';
import 'leaflet/dist/leaflet.css';
import { mountApp } from './app.js';
import { geocoder } from './geocoding.js';
import { mountMap } from './map.js';

const root = document.querySelector('#app');
mountApp(root, { geocoder, mapFactory: mountMap });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // The app remains usable online if offline support is unavailable.
    });
  });
}
