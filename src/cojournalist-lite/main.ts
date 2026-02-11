import { mount } from 'svelte';
import App from './App.svelte';
import { initAuth } from './stores/auth';
import '@shared/styles/global.css';
import './styles.css';

// Handle GitHub Pages SPA redirect
const params = new URLSearchParams(window.location.search);
const redirectedRoute = params.get('route');
if (redirectedRoute) {
  window.history.replaceState(null, '', redirectedRoute);
}

// Initialize authentication
initAuth();

// Mount Svelte app
mount(App, { target: document.getElementById('app')! });
