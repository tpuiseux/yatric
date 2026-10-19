<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import type {
    TrainingPlan,
    TrainingDay,
    TrainingWeek,
    Workout,
  } from "../../schema/training-plan.js";
  import type { RecordedActivity, WorkoutFeedback } from "../trainingLog.js";
  import type { Settings } from "../settings.js";
  import WeekCard from "./WeekCard.svelte";
  import type { WeekReview } from "../weekReview.js";
  import { getTodayISO } from "../utils.js";

  interface Props {
    plan: TrainingPlan;
    activitiesByDate: Record<string, RecordedActivity[]>;
    feedback: Record<string, WorkoutFeedback>;
    settings: Settings;
    filters: { sport: string; status: string };
    onWorkoutClick: (workout: Workout, day: TrainingDay) => void;
    onWorkoutMove: (workoutId: string, newDate: string) => void;
    onAddWorkout: (day: TrainingDay) => void;
    onActivityClick: (activity: RecordedActivity) => void;
    weekReviews: Record<number, WeekReview>;
    onReviewWeek: (week: TrainingWeek) => void;
  }

  let {
    plan,
    activitiesByDate,
    feedback,
    settings,
    filters,
    onWorkoutClick,
    onWorkoutMove,
    onAddWorkout,
    onActivityClick,
    weekReviews,
    onReviewWeek,
  }: Props = $props();

  const today = getTodayISO();

  // Open on today rather than week 1 - mid-plan, today is what you came
  // for, and on a phone week 1 can be dozens of screens away. afterNavigate,
  // not onMount: SvelteKit resets the scroll to the top once navigation
  // finishes, which would undo a scroll done any earlier. Instant, not smooth
  // (global.css sets scroll-behavior: smooth): nobody wants to watch the plan
  // scroll past on every load. Only on entering the page - not after the
  // invalidateAll() that follows each edit, which would yank the view away.
  afterNavigate(({ type }) => {
    if (type === "enter" || type === "link" || type === "goto") {
      document
        .getElementById("today-column")
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  });

  function filterWorkout(workout: Workout): boolean {
    if (filters.sport !== "all" && workout.sport !== filters.sport) {
      return false;
    }
    if (filters.status === "completed" && !workout.completed) {
      return false;
    }
    if (filters.status === "pending" && workout.completed) {
      return false;
    }
    return true;
  }

  const currentWeek = $derived.by(() => {
    const today = new Date().toISOString().slice(0, 10);
    return plan.weeks?.find((w) => w.startDate <= today && today <= w.endDate)?.weekNumber ?? null;
  });
</script>

<div class="phase-timeline">
  {#each plan.phases ?? [] as phase}
    {@const weeks = phase.endWeek - phase.startWeek + 1}
    {@const phaseName = phase.name.toLowerCase()}
    <button
      class="phase-segment {phaseName}"
      class:current={currentWeek !== null &&
        phase.startWeek <= currentWeek &&
        currentWeek <= phase.endWeek}
      style="flex: {weeks}"
      onclick={() => {
        const weekCard = document.querySelector(`[data-week="${phase.startWeek}"]`);
        weekCard?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      <span class="phase-label">{phase.name}</span>
    </button>
  {/each}
</div>

<div class="weeks-container">
  {#each plan.weeks ?? [] as week, index (week.weekNumber)}
    <div data-week={week.weekNumber}>
      <WeekCard
        {week}
        {today}
        {activitiesByDate}
        {feedback}
        {settings}
        {filterWorkout}
        {onWorkoutClick}
        onDrop={onWorkoutMove}
        {onAddWorkout}
        {onActivityClick}
        review={weekReviews[week.weekNumber]}
        onReview={() => onReviewWeek(week)}
        animationDelay={index * 0.05}
      />
    </div>
  {/each}
</div>

<style>
  .phase-timeline {
    display: flex;
    gap: 4px;
    margin-bottom: 1.5rem;
    padding: 0 1rem;
  }

  .phase-segment {
    --c: var(--text-muted);
    flex: 1;
    min-width: 0;
    height: 30px;
    border-radius: 6px;
    border: none;
    border-top: 2px solid var(--c);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      transform var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--c) 10%, transparent);
  }

  .phase-segment.current {
    background: color-mix(in srgb, var(--c) 24%, transparent);
  }

  @media (hover: hover) {
    .phase-segment:hover {
      background: color-mix(in srgb, var(--c) 20%, transparent);
    }
  }

  .phase-segment:active {
    transform: scale(0.98);
  }

  .phase-label {
    padding: 0 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.66rem;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--c);
  }

  .phase-segment.base {
    --c: var(--phase-base);
  }
  .phase-segment.build {
    --c: var(--phase-build);
  }
  .phase-segment.peak {
    --c: var(--phase-peak);
  }
  .phase-segment.taper {
    --c: var(--phase-taper);
  }
  .phase-segment.recovery {
    --c: var(--phase-recovery);
  }
  .phase-segment.rebuild {
    --c: var(--phase-rebuild);
  }
  .phase-segment.survival {
    --c: var(--race);
  }
  .phase-segment.bank {
    --c: var(--bike);
  }

  .weeks-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  @media (max-width: 800px) {
    .phase-timeline {
      padding: 0;
      margin-bottom: 1rem;
    }

    .weeks-container {
      gap: 1rem;
    }
  }
</style>
