import { mount } from 'svelte';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';
import App from './App.svelte';
import { startStore } from './lib/store.svelte';

startStore();

// Browser bitten, die lokalen Daten nicht bei Speicherknappheit zu löschen
void navigator.storage?.persist?.();

export default mount(App, { target: document.getElementById('app')! });
