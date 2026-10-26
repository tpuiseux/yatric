<script lang="ts">
  import type { Workout } from "../../schema/training-plan.js";
  import type { RecordedActivity, WorkoutFeedback } from "../trainingLog.js";
  import type { Settings } from "../settings.js";
  import { getI18n } from "../i18n/index.js";
  import { intensityOf } from "../intensity.js";
  import { activityParts } from "../format.js";

  /**
   * A session in the week, coloured by its intensity (z1 calm to z5 hard):
   * what it is, how long, and what the watch recorded. Drag it to another
   * day to move it.
   */
  interface Props {
    workout: Workout;
    feedback?: WorkoutFeedback;
    /** Garmin activities matched to this workout (see matchDay). */
    recorded?: RecordedActivity[];
    /** The day is over and nothing was done or recorded. */
    missed?: boolean;
    settings: Settings;
    /** Larger type, for today's sessions. */
    large?: boolean;
    onClick: () => void;
  }

  let {
    workout,
    feedback,
    recorded = [],
    missed = false,
    settings,
    large = false,
    onClick,
  }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const intensity = $derived(intensityOf(workout));
  const label = $derived(
    workout.sport === "run" ? m.intensity[intensity] : (m.sport[workout.sport] ?? workout.sport)
  );
  const kind = $derived(
    intensity === "rest" ? "rest" : missed && !workout.completed ? "missed" : intensity
  );

  let dragging = $state(false);

  function handleDragStart(e: DragEvent) {
    dragging = true;
    e.dataTransfer!.setData("text/plain", workout.id);
    e.dataTransfer!.effectAllowed = "move";
  }
</script>

<button
  class="session {kind}"
  class:large
  class:dragging
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={() => (dragging = false)}
  onclick={onClick}
>
  <span class="meta">
    <span>{kind === "missed" ? `${label}, ${m.session.missed}` : label}</span>
    {#if workout.durationMinutes}
      <span class="num">{fmt.duration(workout.durationMinutes)}</span>
    {/if}
  </span>
  <span class="name">{workout.name}</span>
  {#each recorded as activity (activity.id)}
    {@const p = activityParts(activity, settings, fmt)}
    <span class="done">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      {m.session.summary(p.distance, p.time, "")}
    </span>
  {:else}
    {#if workout.completed}
      <span class="done">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        {m.session.done}
      </span>
    {/if}
  {/each}
  {#if feedback?.pain}
    <span class="pain">{m.session.pain}</span>
  {/if}
</button>

<style>
  .session {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    min-width: 0;
    padding: 10px var(--space-3);
    border-radius: var(--radius-s);
    border: 1px solid transparent;
    background: var(--z2);
    color: var(--on-z2);
    text-align: left;
    font: inherit;
    cursor: grab;
    transition: filter var(--transition-fast);
  }
  .session:hover {
    filter: brightness(0.96);
  }
  .session:active {
    cursor: grabbing;
  }
  .session.dragging {
    opacity: 0.5;
  }
  .z1 {
    background: var(--z1);
    color: var(--on-z1);
  }
  .z3 {
    background: var(--z3);
    color: var(--on-z3);
  }
  .z4 {
    background: var(--z4);
    color: var(--on-z4);
  }
  .z5 {
    background: var(--z5);
    color: var(--on-z5);
  }
  .race {
    background: var(--race);
    color: var(--on-race);
  }
  .rest,
  .missed {
    background: transparent;
    color: var(--ink-muted);
  }
  .rest {
    border-color: var(--line);
  }
  .missed {
    border: 1px dashed var(--line-strong);
  }
  .missed .name {
    text-decoration: line-through;
    text-decoration-thickness: 1px;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 var(--space-2);
    font-size: 12px;
    line-height: 16px;
    font-weight: 560;
  }
  .meta > :last-child {
    white-space: nowrap;
  }
  .name {
    font-size: 14px;
    line-height: 19px;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .done {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
    font-size: 12px;
    line-height: 16px;
    font-weight: 560;
  }
  .done svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .pain {
    align-self: flex-start;
    margin-top: var(--space-1);
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 11px;
    line-height: 16px;
    font-weight: 650;
  }

  .large {
    padding: var(--space-3) var(--space-4);
  }
  .large .meta {
    font-size: 13px;
  }
  .large .name {
    font-size: 17px;
    line-height: 22px;
  }
</style>
