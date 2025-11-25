// src/lib/stores.js
import { writable } from 'svelte/store';

export const connected = writable(false);
export const server = writable('Tokyo, Japan');
export const killswitch = writable(true);
export const upload = writable('0 GB');
export const download = writable('0 GB');
export const ping = writable('-- ms');