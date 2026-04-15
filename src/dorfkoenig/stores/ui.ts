// Global UI state stores for modal visibility.

import { writable } from 'svelte/store';

/** Controls the ScoutModal (new scout wizard) open/close state. */
export const showScoutModal = writable(false);

/** Controls the UploadModal (manual upload wizard) open/close state. */
export const showUploadModal = writable(false);

/** Controls the CivicScoutModal (civic scout wizard) open/close state. */
export const showCivicScoutModal = writable(false);

/** Controls the SettingsModal (prompts + max units) open/close state. */
export const showSettingsModal = writable(false);
