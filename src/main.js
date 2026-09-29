import './styles.css';
import { mountApp } from './app.js';

mountApp(document.querySelector('#app'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // The app remains usable online if offline support is unavailable.
    });
  });
}
