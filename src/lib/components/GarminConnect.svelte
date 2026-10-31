<script lang="ts">
  import { base } from "$app/paths";
  import { getSyncStatus, runSync, type SyncState } from "../garminSyncClient.js";
  import { getI18n } from "../i18n/index.js";

  /** Connect Garmin (with its MFA step), then sync: used by the settings
   * and by plan creation. */

  interface Props {
    onSynced: () => void;
  }

  let { onSynced }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  // Garmin connection ----------------------------------------------------
  type GarminState = "loading" | "disconnected" | "mfa" | "connected";
  let garminState = $state<GarminState>("loading");
  let garminEmail = $state("");
  let garminPassword = $state("");
  let garminCode = $state("");
  let garminBusy = $state(false);
  let garminStatus = $state<{ message: string; isError: boolean } | null>(null);

  $effect(() => {
    fetch(`${base}/garmin/status`)
      .then((r) => r.json())
      .then((data) => {
        garminState = data.connected ? "connected" : "disconnected";
        if (data.connected) loadSyncState();
      })
      .catch(() => {
        garminState = "disconnected";
      });
  });

  // Garmin data sync (activities + recovery) ------------------------------

  let syncState = $state<SyncState | null>(null);
  let syncing = $state(false);

  function loadSyncState() {
    getSyncStatus()
      .then((s) => {
        syncState = s.state;
        syncing = s.state?.status === "running";
      })
      .catch(() => {});
  }

  async function handleSync() {
    if (syncing) return;
    syncing = true;
    try {
      const state = await runSync(true);
      if (state) {
        syncState = state;
        if (state.status === "success") onSynced();
      }
    } catch (err) {
      syncState = {
        status: "failed",
        last_success_at: syncState?.last_success_at ?? null,
        activities_synced: null,
        wellness_days_synced: null,
        error: err instanceof Error ? err.message : m.common.somethingWrong,
      };
    } finally {
      syncing = false;
    }
  }

  function onGarminConnected() {
    garminState = "connected";
    garminEmail = "";
    garminPassword = "";
    garminCode = "";
    // First sync right away, so the plan shows what's been recorded.
    handleSync();
  }

  async function handleGarminConnect() {
    if (garminBusy) return;
    garminBusy = true;
    garminStatus = null;
    try {
      const res = await fetch(`${base}/garmin/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: garminEmail, password: garminPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? m.settings.connectFailed);
      if (data.mfaRequired) {
        garminState = "mfa";
      } else {
        onGarminConnected();
      }
    } catch (err) {
      garminStatus = {
        message: err instanceof Error ? err.message : m.settings.connectFailed,
        isError: true,
      };
    } finally {
      garminBusy = false;
    }
  }

  async function handleGarminMfa() {
    if (garminBusy) return;
    garminBusy = true;
    garminStatus = null;
    try {
      const res = await fetch(`${base}/garmin/mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: garminCode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? m.settings.codeRefused);
      onGarminConnected();
    } catch (err) {
      garminStatus = {
        message: err instanceof Error ? err.message : m.settings.codeRefused,
        isError: true,
      };
    } finally {
      garminBusy = false;
    }
  }

  async function handleGarminDisconnect() {
    if (garminBusy) return;
    garminBusy = true;
    garminStatus = null;
    try {
      await fetch(`${base}/garmin/disconnect`, { method: "POST" });
      garminState = "disconnected";
    } finally {
      garminBusy = false;
    }
  }
</script>

{#if garminState === "loading"}
  <p class="muted">{m.settings.checking}</p>
{:else if garminState === "connected"}
  <div class="action">
    <div>
      <b>{m.settings.connected}</b>
      <span class="small muted">{m.settings.connectedHint}</span>
    </div>
    <button class="btn btn-ghost btn-danger" onclick={handleGarminDisconnect} disabled={garminBusy}>
      {m.settings.disconnect}
    </button>
  </div>
  <div class="action">
    <div>
      <b>{m.settings.syncTitle}</b>
      <span class="small muted">
        {#if syncing}
          {m.settings.syncingFirst}
        {:else if syncState?.status === "failed"}
          <span class="error">{m.settings.syncFailed(syncState.error ?? "")}</span>
        {:else if syncState?.last_success_at}
          {m.settings.synced(
            fmt.relative(syncState.last_success_at),
            syncState.activities_synced ?? 0,
            syncState.wellness_days_synced ?? 0
          )}
        {:else}
          {m.settings.notSynced}
        {/if}
      </span>
      <span class="small muted">{m.settings.syncAuto}</span>
    </div>
    <button class="btn" onclick={handleSync} disabled={syncing}>
      {syncing ? m.settings.syncing : m.settings.syncNow}
    </button>
  </div>
{:else if garminState === "mfa"}
  <label class="field narrow">
    {m.settings.code}
    <input
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      class="input"
      bind:value={garminCode}
      placeholder="123456"
    />
  </label>
  <div>
    <button class="btn btn-primary" onclick={handleGarminMfa} disabled={garminBusy}>
      {garminBusy ? m.settings.verifying : m.settings.confirmCode}
    </button>
  </div>
{:else}
  <div class="grid2">
    <label class="field">
      {m.settings.email}
      <input type="email" class="input" autocomplete="username" bind:value={garminEmail} />
    </label>
    <label class="field">
      {m.settings.password}
      <input
        type="password"
        class="input"
        autocomplete="current-password"
        bind:value={garminPassword}
      />
    </label>
  </div>
  <div>
    <button
      class="btn btn-primary"
      onclick={handleGarminConnect}
      disabled={garminBusy || !garminEmail || !garminPassword}
    >
      {garminBusy ? m.settings.connecting : m.settings.connect}
    </button>
  </div>
{/if}

{#if garminStatus}
  <p class="notice" class:error={garminStatus.isError}>{garminStatus.message}</p>
{/if}

<style>
  .grid2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }
  .narrow {
    max-width: 280px;
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--line);
  }
  .action > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .error {
    color: var(--danger);
  }
  @media (max-width: 640px) {
    .grid2 {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
