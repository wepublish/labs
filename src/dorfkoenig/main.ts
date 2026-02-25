import { mount } from 'svelte';
import App from './App.svelte';
import { initAuth } from './stores/auth';
import { isInIframe } from '@shared/utils/iframe-bridge';
import '@shared/styles/global.css';
import './styles.css';

// Read token BEFORE any URL manipulation (GitHub Pages redirect clears params)
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const inIframe = isInIframe();

// Handle GitHub Pages SPA redirect
const redirectedRoute = params.get('route');
if (redirectedRoute) {
  window.history.replaceState(null, '', redirectedRoute);
}

// Initialize authentication with URL token if present
initAuth(token, inIframe);

// Mount Svelte app
mount(App, { target: document.getElementById('app')! });
