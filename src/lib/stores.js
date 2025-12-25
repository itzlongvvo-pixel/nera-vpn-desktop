/*
  Nera VPN™
  Copyright © 2025 Vio Holdings LLC. All rights reserved.
  Nera VPN™ is a trademark of Vio Holdings LLC.
  This software is proprietary and confidential. Unauthorized copying,
  distribution, modification, or use of this software, via any medium,
  is strictly prohibited without written permission from the copyright holder.
  The source code and binaries are protected by copyright law and international treaties.
*/
// src/lib/stores.js
import { writable } from 'svelte/store';

export const connected = writable(false);
export const server = writable('Tokyo, Japan');
export const killswitch = writable(true);
export const upload = writable('0 GB');
export const download = writable('0 GB');
export const ping = writable('-- ms');