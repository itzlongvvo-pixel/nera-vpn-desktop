<script>
  import { invoke } from '@tauri-apps/api/tauri';
  import { onMount } from 'svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { appWindow } from '@tauri-apps/api/window';

  const SETTINGS_KEY = 'nera-vpn-settings';

  // Fake routes for now; all still use nera.conf
  const ROUTES = [
    { key: 'tokyo', label: 'Tokyo, Japan' },
    { key: 'la', label: 'Los Angeles, USA' },
    { key: 'singapore', label: 'Singapore' },
    { key: 'london', label: 'London, UK' }
  ];

  let connected = false;
  let isBusy = false;

  // Route state (persisted)
  let selectedRouteKey = 'tokyo';
  let routeMenuOpen = false;

  // Session controls (persisted)
  let killswitch = true;
  let launchOnStartup = true;    // UI-only for now
  let autoConnectWifi = true;
  let startMinimized = false;    // NEW: start minimized to tray

  let appVersion = '';
  let importMessage = '';
  let vpnError = '';

  // "Check my IP" state
  let ipChecking = false;
  let ipData = null;
  let ipError = '';

  function currentRouteLabel() {
    const found = ROUTES.find((r) => r.key === selectedRouteKey);
    return found ? found.label : ROUTES[0].label;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (typeof data.killswitch === 'boolean') killswitch = data.killswitch;
      if (typeof data.launchOnStartup === 'boolean') launchOnStartup = data.launchOnStartup;
      if (typeof data.autoConnectWifi === 'boolean') autoConnectWifi = data.autoConnectWifi;
      if (typeof data.startMinimized === 'boolean') startMinimized = data.startMinimized;
      if (typeof data.selectedRouteKey === 'string') selectedRouteKey = data.selectedRouteKey;
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  function saveSettings() {
    try {
      const data = {
        killswitch,
        launchOnStartup,
        autoConnectWifi,
        startMinimized,
        selectedRouteKey
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  }

  function selectRoute(key) {
    selectedRouteKey = key;
    saveSettings();
    routeMenuOpen = false;
  }

  async function toggle() {
    if (isBusy) return;
    isBusy = true;
    vpnError = '';
    importMessage = '';

    try {
      if (!connected) {
        await invoke('connect_vpn');
        connected = true;
      } else {
        await invoke('disconnect_vpn');
        connected = false;
      }
    } catch (error) {
      console.error('VPN toggle failed:', error);
      vpnError = String(error);
    } finally {
      isBusy = false;
    }
  }

  async function handleImportConfig() {
    importMessage = '';
    vpnError = '';

    try {
      const destPath = await invoke('import_wireguard_config');
      console.log('Config saved to:', destPath);
      importMessage = 'Config imported successfully.';
    } catch (error) {
      console.error('Import config failed:', error);
      const msg = String(error);
      if (msg.includes('No file selected')) {
        importMessage = 'Import cancelled.';
      } else {
        importMessage = 'Failed to import config.';
        vpnError = msg;
      }
    }
  }

  // Simple external IP + location lookup
  async function checkIp() {
    ipError = '';
    ipData = null;
    ipChecking = true;

    try {
      const res = await fetch('https://ipwho.is/');
      if (!res.ok) throw new Error('Failed to reach IP service');

      const data = await res.json();
      if (data && data.success === false) {
        throw new Error(data.message || 'IP lookup failed');
      }

      ipData = data;
    } catch (e) {
      console.error('IP check failed', e);
      ipError = e.message || 'Could not check IP.';
    } finally {
      ipChecking = false;
    }
  }

  onMount(async () => {
    // Load saved toggle + route settings
    loadSettings();

    // NEW: start minimized to tray if user enabled it
    if (startMinimized) {
      try {
        await appWindow.hide();
      } catch (e) {
        console.error('Failed to hide on launch', e);
      }
    }

    // App version for footer
    try {
      appVersion = await getVersion();
    } catch (e) {
      console.error('Failed to get app version', e);
    }

    // Optional: auto-connect on launch when enabled
    if (autoConnectWifi) {
      // Don't await; let UI render
      toggle();
    }
  });
</script>

<main>
  <div class="background">
    <div class="glow glow-top"></div>
    <div class="glow glow-bottom"></div>
  </div>

  <div class="frame">
    <!-- Left glass panel with logo + title -->
    <aside class="spine">
      <div class="spine-inner">
        <div class="logo-wrap">
          <img src="/nera-logo.svg" alt="Nera VPN logo" class="logo" />
        </div>
        <div class="brand">
          <h1>Nera VPN</h1>
          <p>{connected ? 'Connected securely' : 'Secure tunnel ready'}</p>
        </div>
      </div>
      <div class="spine-footer">
        <span class="version">
          {appVersion ? `v${appVersion}` : ''}
        </span>
      </div>
    </aside>

    <!-- Main content -->
    <section class="content">
      <!-- Status + Command Ring -->
      <div class="top-row">
        <div class="status-stack">
          <div class={`status-pill ${connected ? 'on' : 'off'}`}>
            <span class="dot"></span>
            <span class="pill-text">
              {connected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          <div class="server-line">
            <span class="label">Route</span>

            <!-- Route pill with dropdown -->
            <div class="route-wrapper">
              <button
                class="route-pill"
                type="button"
                on:click={() => (routeMenuOpen = !routeMenuOpen)}
              >
                <span class="value">{currentRouteLabel()}</span>
                <span class="chevron">▾</span>
              </button>

              {#if routeMenuOpen}
                <div class="route-menu">
                  {#each ROUTES as route}
                    <button
                      type="button"
                      class="route-item"
                      on:click={() => selectRoute(route.key)}
                    >
                      <span class={`route-dot ${route.key === selectedRouteKey ? 'active' : ''}`}></span>
                      <span class="route-label">{route.label}</span>
                      {#if route.key === selectedRouteKey}
                        <span class="route-check">✓</span>
                      {/if}
                    </button>
                  {/each}
                  <div class="route-footnote">
                    Multi-route configs coming soon.
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <div class="ring-wrap">
          <div class={`ring-outer ${connected ? 'on' : ''}`}>
            <div class="ring-inner">
              <button
                class={`ring-button ${connected ? 'on' : ''}`}
                on:click={toggle}
                disabled={isBusy}
              >
                <span class="ring-state">
                  {connected ? 'ON' : 'OFF'}
                </span>
                <span class="ring-label">
                  {#if isBusy}
                    {connected ? 'Disconnecting' : 'Connecting'}
                  {:else}
                    {connected ? 'Disconnect' : 'Connect'}
                  {/if}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats + Session Controls -->
      <div class="grid">
        <!-- TRAFFIC CARD -->
        <div class="card">
          <div class="card-title">Traffic</div>
          <div class="stats">
            <div class="stat">
              <span class="stat-label">Upload</span>
              <span class="stat-value">{connected ? '2.1 GB' : '—'}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Download</span>
              <span class="stat-value">{connected ? '1.8 GB' : '—'}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Ping</span>
              <span class="stat-value">{connected ? '18 ms' : '—'}</span>
            </div>
          </div>

          <div class="ip-section">
            <button class="ip-button" on:click={checkIp} disabled={ipChecking}>
              {ipChecking ? 'Checking IP…' : 'Check current IP'}
            </button>

            {#if ipData}
              <p class="ip-info">
                {ipData.ip}
                {#if ipData.city || ipData.country}
                  &nbsp;— {ipData.city ? `${ipData.city}, ` : ''}{ipData.country}
                {/if}
              </p>
            {/if}

            {#if ipError}
              <p class="ip-error">{ipError}</p>
            {/if}

            {#if !ipData && !ipError}
              <p class="hint">
                Use “Check current IP” to confirm traffic is routed through your VPN.
              </p>
            {/if}
          </div>
        </div>

        <!-- SESSION CONTROLS CARD -->
        <div class="card">
          <div class="card-title">Session controls</div>
          <div class="options">
            <!-- Kill Switch -->
            <div class="option-row">
              <div class="option-icon icon-danger">!</div>
              <div class="option-text">
                <span>Kill Switch</span>
                <small>Block traffic instantly if VPN drops.</small>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  bind:checked={killswitch}
                  on:change={saveSettings}
                />
                <span class="toggle-track">
                  <span class="toggle-thumb"></span>
                </span>
              </label>
            </div>

            <!-- Launch on Startup (UI only for now) -->
            <div class="option-row">
              <div class="option-icon icon-startup">✶</div>
              <div class="option-text">
                <span>Launch on Startup</span>
                <small>Open Nera when your OS starts.</small>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  bind:checked={launchOnStartup}
                  on:change={saveSettings}
                />
                <span class="toggle-track">
                  <span class="toggle-thumb"></span>
                </span>
              </label>
            </div>

            <!-- NEW: Start minimized to tray -->
            <div class="option-row">
              <div class="option-icon icon-minimize">▾</div>
              <div class="option-text">
                <span>Start minimized to tray</span>
                <small>Keep Nera in the system tray on launch.</small>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  bind:checked={startMinimized}
                  on:change={saveSettings}
                />
                <span class="toggle-track">
                  <span class="toggle-thumb"></span>
                </span>
              </label>
            </div>

            <!-- Auto-connect on Wi-Fi -->
            <div class="option-row">
              <div class="option-icon icon-wifi">Ꙩ</div>
              <div class="option-text">
                <span>Auto-connect on Wi-Fi</span>
                <small>
                  Auto-connect when Nera opens. (We’ll later tie this to specific
                  Wi-Fi networks.)
                </small>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  bind:checked={autoConnectWifi}
                  on:change={saveSettings}
                />
                <span class="toggle-track">
                  <span class="toggle-thumb"></span>
                </span>
              </label>
            </div>
          </div>

          <p class="option-footnote">
            Higher security: enable Kill Switch + Auto-connect.
          </p>
        </div>
      </div>

      <!-- Import + messages -->
      <div class="bottom">
        <button class="import" on:click={handleImportConfig} disabled={isBusy}>
          Import Config (.conf)
        </button>

        {#if importMessage}
          <p class="info">{importMessage}</p>
        {/if}

        {#if vpnError}
          <p class="error">{vpnError}</p>
        {/if}
      </div>
    </section>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    margin: 0;
    background: #020617;
    color: #e5e7eb;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .background {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .glow {
    position: absolute;
    border-radius: 999px;
    filter: blur(90px);
    opacity: 0.35;
  }

  .glow-top {
    width: 420px;
    height: 420px;
    background: #22d3ee;
    top: -120px;
    left: -80px;
  }

  .glow-bottom {
    width: 460px;
    height: 460px;
    background: #22c55e;
    bottom: -160px;
    right: -100px;
  }

  .frame {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 760px;
    border-radius: 26px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow:
      0 30px 70px rgba(0, 0, 0, 0.9),
      0 0 0 1px rgba(15, 23, 42, 0.95);
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    overflow: hidden;
    background: #020617;
  }

  @media (max-width: 720px) {
    .frame {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .spine {
    background: radial-gradient(circle at top, #0f172a, #020617 50%, #020617 100%);
    border-right: 1px solid rgba(15, 23, 42, 0.9);
    padding: 1.4rem 1.2rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .spine-inner {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .logo-wrap {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 20px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at 10% 0%, rgba(56, 189, 248, 0.3), transparent 60%),
      radial-gradient(circle at 90% 100%, rgba(34, 197, 94, 0.35), transparent 65%),
      linear-gradient(145deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.98));
    border: 1px solid rgba(148, 163, 184, 0.65);
    box-shadow:
      0 0 32px rgba(56, 189, 248, 0.7),
      0 0 22px rgba(34, 197, 94, 0.65),
      0 0 0 1px rgba(15, 23, 42, 1);
    backdrop-filter: blur(18px);
  }

  .logo {
    width: 40px;
    height: 40px;
    display: block;
  }

  .brand h1 {
    margin: 0;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    background: linear-gradient(135deg, #4df3ff, #22c55e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .brand p {
    margin: 0.25rem 0 0;
    font-size: 0.82rem;
    color: #9ca3af;
  }

  .spine-footer {
    font-size: 0.8rem;
    color: #6b7280;
  }

  .version {
    opacity: 0.9;
  }

  .content {
    padding: 1.6rem 1.7rem 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }

  .top-row {
    display: flex;
    gap: 1.4rem;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .status-stack {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .status-pill {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.45);
    font-size: 0.8rem;
    background: rgba(15, 23, 42, 0.9);
  }

  .status-pill.on {
    border-color: rgba(34, 197, 94, 0.8);
    background: rgba(22, 163, 74, 0.22);
    color: #bbf7d0;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #ef4444;
  }

  .status-pill.on .dot {
    background: #22c55e;
  }

  .server-line {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.86rem;
  }

  .server-line .label {
    color: #9ca3af;
    font-size: 0.78rem;
  }

  .route-wrapper {
    position: relative;
    display: inline-block;
  }

  .route-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.9);
    font-size: 0.8rem;
    color: #e5e7eb;
    cursor: pointer;
  }

  .route-pill .chevron {
    font-size: 0.65rem;
    color: #9ca3af;
  }

  .route-menu {
    position: absolute;
    top: 110%;
    left: 0;
    min-width: 220px;
    border-radius: 14px;
    padding: 0.35rem 0.4rem 0.5rem;
    background: rgba(15, 23, 42, 0.98);
    border: 1px solid rgba(148, 163, 184, 0.45);
    box-shadow:
      0 18px 45px rgba(0, 0, 0, 0.85),
      0 0 0 1px rgba(15, 23, 42, 0.95);
    z-index: 10;
  }

  .route-item {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.4rem;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: #e5e7eb;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .route-item:hover {
    background: rgba(31, 41, 55, 0.9);
  }

  .route-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #6b7280;
  }

  .route-dot.active {
    background: #22c55e;
  }

  .route-check {
    font-size: 0.78rem;
    color: #22c55e;
  }

  .route-footnote {
    margin-top: 0.35rem;
    font-size: 0.74rem;
    color: #9ca3af;
    padding: 0 0.4rem 0.1rem;
  }

  .ring-wrap {
    flex-shrink: 0;
    width: 190px;
    height: 190px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ring-outer {
    width: 100%;
    height: 100%;
    border-radius: 999px;
    border: 2px solid rgba(148, 163, 184, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 1px rgba(15, 23, 42, 1);
    background: radial-gradient(circle at top, rgba(15, 23, 42, 1), rgba(15, 23, 42, 0.95));
  }

  .ring-outer.on {
    border-color: rgba(34, 197, 94, 0.95);
    box-shadow:
      0 0 40px rgba(34, 197, 94, 0.85),
      0 0 0 1px rgba(15, 23, 42, 1);
  }

  .ring-inner {
    width: 72%;
    height: 72%;
    border-radius: 999px;
    border: 1px solid rgba(51, 65, 85, 0.9);
    background: radial-gradient(circle at 25% 0%, #0ea5e9, #22c55e 60%, #0f172a 100%);
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ring-button {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    border: none;
    cursor: pointer;
    background: radial-gradient(circle at 50% 0%, #e0f2fe, #bbf7d0 70%, #16a34a);
    color: #022c22;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    box-shadow:
      0 14px 30px rgba(34, 197, 94, 0.8),
      0 0 0 1px rgba(15, 23, 42, 0.9);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.76rem;
    font-weight: 600;
    transition: transform 0.08s ease-out, box-shadow 0.12s ease-out;
  }

  .ring-button.on {
    box-shadow:
      0 18px 40px rgba(22, 163, 74, 0.9),
      0 0 0 1px rgba(8, 47, 73, 0.95);
  }

  .ring-button:active:not(:disabled) {
    transform: translateY(1px);
    box-shadow:
      0 10px 24px rgba(22, 163, 74, 0.8),
      0 0 0 1px rgba(15, 23, 42, 0.95);
  }

  .ring-button:disabled {
    opacity: 0.9;
    cursor: default;
  }

  .ring-state {
    font-size: 0.7rem;
  }

  .ring-label {
    font-size: 0.7rem;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.1fr);
    gap: 0.9rem;
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .card {
    border-radius: 16px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: radial-gradient(circle at top, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.9));
    padding: 0.9rem 1rem;
    font-size: 0.9rem;
  }

  .card-title {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #9ca3af;
    margin-bottom: 0.6rem;
  }

  .stats {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .stat {
    display: flex;
    justify-content: space-between;
  }

  .stat-label {
    color: #9ca3af;
  }

  .stat-value {
    font-weight: 500;
  }

  .ip-section {
    margin-top: 0.9rem;
    border-top: 1px solid rgba(31, 41, 55, 0.8);
    padding-top: 0.65rem;
    font-size: 0.82rem;
  }

  .ip-button {
    width: 100%;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.6);
    background: #020617;
    color: #e5e7eb;
    padding: 0.45rem 0.8rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .ip-button:disabled {
    opacity: 0.75;
    cursor: default;
  }

  .ip-info {
    margin-top: 0.4rem;
    color: #e5e7eb;
  }

  .ip-error {
    margin-top: 0.4rem;
    color: #f97373;
  }

  .hint {
    margin-top: 0.4rem;
    color: #9ca3af;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .option-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.7rem;
  }

  .option-icon {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 600;
    color: #020617;
  }

  .icon-danger {
    background: radial-gradient(circle at 30% 0%, #fecaca, #f97373);
  }

  .icon-startup {
    background: radial-gradient(circle at 30% 0%, #bfdbfe, #38bdf8);
  }

  .icon-minimize {
    background: radial-gradient(circle at 30% 0%, #ddd6fe, #a855f7);
  }

  .icon-wifi {
    background: radial-gradient(circle at 30% 0%, #bbf7d0, #22c55e);
  }

  .option-text span {
    display: block;
  }

  .option-text small {
    display: block;
    font-size: 0.75rem;
    color: #9ca3af;
    margin-top: 0.05rem;
  }

  .toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .toggle-track {
    width: 42px;
    height: 22px;
    border-radius: 999px;
    background: #020617;
    border: 1px solid rgba(148, 163, 184, 0.6);
    display: flex;
    align-items: center;
    padding: 2px;
    transition: background 0.15s ease-out, border-color 0.15s ease-out;
  }

  .toggle-thumb {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: #e5e7eb;
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.6);
    transform: translateX(0);
    transition: transform 0.15s ease-out, background 0.15s ease-out;
  }

  .toggle input:checked + .toggle-track {
    background: radial-gradient(circle at 30% 0%, #a7f3d0, #22c55e);
    border-color: rgba(34, 197, 94, 0.9);
  }

  .toggle input:checked + .toggle-track .toggle-thumb {
    transform: translateX(18px);
    background: #022c22;
  }

  .option-footnote {
    margin-top: 0.7rem;
    font-size: 0.78rem;
    color: #9ca3af;
  }

  .bottom {
    margin-top: 1rem;
  }

  .import {
    width: 100%;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.5);
    background: #020617;
    color: #e5e7eb;
    padding: 0.7rem 1rem;
    font-size: 0.86rem;
    cursor: pointer;
    text-align: center;
  }

  .import:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .info {
    margin-top: 0.45rem;
    font-size: 0.82rem;
    color: #9ca3af;
  }

  .error {
    margin-top: 0.25rem;
    font-size: 0.82rem;
    color: #f97373;
  }
</style>
