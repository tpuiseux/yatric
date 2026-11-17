<script lang="ts">
  import { untrack } from "svelte";
  import { base } from "$app/paths";
  import { invalidateAll } from "$app/navigation";
  import { formatClock } from "../activityAnalysis.js";
  import { getI18n } from "../i18n/index.js";
  import type { RecordedActivity } from "../trainingLog.js";

  /** "This run was a race", and its official time: what the prediction calibrates on. */
  interface Props {
    activity: RecordedActivity;
  }

  let { activity }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);

  let race = $state(untrack(() => activity.race ?? false));
  let official = $state(
    untrack(() => (activity.officialSeconds ? formatClock(activity.officialSeconds) : ""))
  );
  let saving = $state(false);
  let status = $state<{ text: string; error: boolean } | null>(null);

  /** "1:42:30" or "42:30" -> seconds; "" -> null; undefined when unreadable. */
  function parseClock(text: string): number | null | undefined {
    if (!text.trim()) return null;
    const parts = text.trim().split(":").map(Number);
    if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
      return undefined;
    }
    return parts.reduce((total, n) => total * 60 + n, 0);
  }

  async function save() {
    const officialSeconds = race ? parseClock(official) : null;
    if (officialSeconds === undefined) {
      status = { text: m.race.invalid, error: true };
      return;
    }
    saving = true;
    status = null;
    try {
      const res = await fetch(`${base}/activities/${activity.id}/race`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race, officialSeconds }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "");
      status = { text: m.race.saved, error: false };
      // The prediction is computed with the page: reload it.
      await invalidateAll();
    } catch (err) {
      status = {
        text: err instanceof Error && err.message ? err.message : m.common.somethingWrong,
        error: true,
      };
    } finally {
      saving = false;
    }
  }
</script>

<div class="race">
  <label class="check">
    <input type="checkbox" bind:checked={race} onchange={save} />
    {m.race.label}
  </label>
  {#if race}
    <div class="row">
      <label class="field">
        {m.race.official}
        <input
          class="input num"
          bind:value={official}
          placeholder={activity.movingSeconds ? formatClock(activity.movingSeconds) : "45:00"}
          inputmode="numeric"
        />
      </label>
      <button class="btn btn-sm" onclick={save} disabled={saving}>
        {saving ? m.common.saving : m.common.save}
      </button>
    </div>
    <span class="small muted">{m.race.hint}</span>
  {/if}
  {#if status}
    <span class="small" class:error={status.error} role="status">{status.text}</span>
  {/if}
</div>

<style>
  .race {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--line);
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
  }
  .row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
  .row .field {
    width: 160px;
  }
  .error {
    color: var(--danger);
  }
</style>
