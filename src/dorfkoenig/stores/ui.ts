// Global UI state stores for modal visibility.

import { writable } from 'svelte/store';

/** Controls the ScoutModal (new scout wizard) open/close state. */
export const showScoutModal = writable(false);

/** Controls the UploadModal (manual upload wizard) open/close state. */
export const showUploadModal = writable(false);
