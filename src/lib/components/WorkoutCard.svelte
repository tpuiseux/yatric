<script lang="ts">
  import type { Workout } from "../../schema/training-plan.js";
  import type { RecordedActivity, WorkoutFeedback } from "../trainingLog.js";
  import type { Settings } from "../settings.js";
  import { formatActivitySummary, formatDuration } from "../utils.js";

  interface Props {
    workout: Workout;
    isCompleted: boolean;
    feedback?: WorkoutFeedback;
    /** Garmin activities matched to this workout (see matchDay). */
    recorded?: RecordedActivity[];
    settings: Settings;
    onClick: () => void;
  }

  let { workout, isCompleted, feedback, recorded, settings, onClick }: Props = $props();

  let isDragging = $state(false);

  function handleDragStart(e: DragEvent) {
    isDragging = true;
    e.dataTransfer!.setData("text/plain", workout.id);
    e.dataTransfer!.effectAllowed = "move";
  }

  function handleDragEnd() {
    isDragging = false;
  }
</script>

<button
  class="workout-card {workout.sport}"
  class:completed={isCompleted}
  class:dragging={isDragging}
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  onclick={onClick}
>
  <div class="workout-sport">{workout.sport}</div>
  <div class="workout-name">{workout.name}</div>
  {#if workout.durationMinutes || feedback}
    <div class="workout-meta">
      {#if workout.durationMinutes}
        <span class="workout-duration">{formatDuration(workout.durationMinutes)}</span>
      {/if}
      {#if feedback?.rpe}
        <span class="feedback-badge" title="Perceived effort">RPE {feedback.rpe}</span>
      {:else if feedback}
        <span class="feedback-badge" title="Feedback logged">✎</span>
      {/if}
      {#if feedback?.pain}
        <span class="feedback-badge pain" title={feedback.painNotes ?? "Pain reported"}>Pain</span>
      {/if}
    </div>
  {/if}
  {#each recorded ?? [] as activity (activity.id)}
    <div class="workout-recorded" title="Recorded on Garmin: {activity.name ?? ''}">
      <span class="recorded-check">✓</span>
      {formatActivitySummary(activity, settings)}
    </div>
  {/each}
</button>

<style>
  .workout-card {
    --c: var(--text-muted);
    width: 100%;
    text-align: left;
    padding: 0.6rem 0.75rem 0.6rem 0.85rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      box-shadow var(--transition-fast),
      border-color var(--transition-fast);
    border: 1px solid color-mix(in srgb, var(--c) 14%, transparent);
    background: color-mix(in srgb, var(--c) 8%, var(--bg-tertiary));
    position: relative;
    overflow: hidden;
  }

  .workout-card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--c);
  }

  .workout-card.swim {
    --c: var(--swim);
  }
  .workout-card.bike {
    --c: var(--bike);
  }
  .workout-card.run {
    --c: var(--run);
  }
  .workout-card.strength {
    --c: var(--strength);
  }
  .workout-card.brick {
    --c: var(--brick);
  }
  .workout-card.race {
    --c: var(--race);
    background: color-mix(in srgb, var(--c) 16%, var(--bg-tertiary));
  }
  .workout-card.rest {
    --c: var(--rest);
    background: transparent;
    border-style: dashed;
    border-color: var(--border-medium);
  }
  .workout-card.rest::before {
    display: none;
  }
  .workout-card.rest .workout-name {
    color: var(--text-secondary);
  }

  /* Hover-only: on touch screens :hover sticks after a tap, leaving the
   * card lifted until you tap elsewhere. */
  @media (hover: hover) {
    .workout-card:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--c) 40%, transparent);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }
  }

  .workout-card.dragging {
    opacity: 0.5;
    transform: scale(0.95);
    cursor: grabbing;
  }

  .workout-card:not(.dragging) {
    cursor: grab;
  }

  .workout-card.completed {
    opacity: 0.6;
  }

  .workout-card.completed::after {
    content: "✓";
    position: absolute;
    top: 0.4rem;
    right: 0.5rem;
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .workout-sport {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.2rem;
  }

  .workout-sport {
    color: var(--c);
  }

  .workout-card.rest .workout-sport {
    color: var(--text-muted);
  }

  .workout-name {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .workout-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.3rem;
  }

  .workout-duration {
    font-family: var(--font-display);
    font-variant-numeric: tabular-nums;
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .feedback-badge {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
    background: var(--bg-elevated);
    color: var(--text-secondary);
  }

  .workout-recorded {
    margin-top: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--border-subtle);
    font-family: var(--font-display);
    font-variant-numeric: tabular-nums;
    font-size: 0.7rem;
    color: var(--text-secondary);
  }

  .recorded-check {
    color: var(--success);
    font-weight: 700;
    margin-right: 0.2rem;
  }

  .feedback-badge.pain {
    background: var(--danger-bg);
    color: var(--danger);
  }

  @media (max-width: 800px) {
    .workout-card {
      padding: 0.7rem 0.85rem;
    }

    .workout-name {
      font-size: 0.9rem;
    }

    .workout-duration {
      font-size: 0.75rem;
    }
  }
</style>
