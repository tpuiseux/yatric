<script lang="ts">
  import type { Settings } from "../settings.js";
  import type { RecordedActivity } from "../trainingLog.js";
  import { getI18n } from "../i18n/index.js";
  import { activityParts } from "../format.js";
  import ActivityAnalysis from "./ActivityAnalysis.svelte";

  /** A recorded activity that matched nothing in the plan, in detail. */
  interface Props {
    activity: RecordedActivity;
    settings: Settings;
    onClose: () => void;
  }

  let { activity, settings, onClose }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);
  const parts = $derived(activityParts(activity, settings, fmt));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains("overlay")) onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="overlay"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="activity-title"
  tabindex="-1"
>
  <div class="drawer">
    <header>
      <div class="titles">
        <span class="small muted first-cap"
          >{m.drawer.meta(
            fmt.date(activity.startLocal.slice(0, 10), "long"),
            m.activity.notInPlan
          )}</span
        >
        <h2 class="title-m" id="activity-title">{activity.name ?? activity.sportType}</h2>
        <span class="small muted"
          >{m.session.summary(parts.distance, parts.time, parts.heartrate)}</span
        >
      </div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick={onClose} aria-label={m.common.close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </header>
    <div class="body">
      <ActivityAnalysis {activity} {settings} />
    </div>
  </div>
</div>

<style>
  /* The header keeps its height; only the middle scrolls. */
  header {
    flex-shrink: 0;
  }
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: flex-end;
    background: rgba(15, 17, 21, 0.32);
  }
  .drawer {
    display: flex;
    flex-direction: column;
    width: min(600px, 100vw);
    height: 100%;
    background: var(--sheet);
    box-shadow: var(--shadow-float);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-8) var(--space-4);
  }
  header svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .first-cap::first-letter {
    text-transform: uppercase;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-2) var(--space-8) var(--space-8);
  }

  @media (max-width: 800px) {
    header,
    .body {
      padding-left: var(--space-4);
      padding-right: var(--space-4);
    }
  }
</style>
