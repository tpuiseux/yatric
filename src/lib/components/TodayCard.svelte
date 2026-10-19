<script lang="ts">
  import type { TrainingDay, TrainingPlan, Workout } from "../../schema/training-plan.js";
  import { matchDay, type RecordedActivity, type WorkoutFeedback } from "../trainingLog.js";
  import type { RacePrediction } from "../racePrediction.js";
  import type { Settings } from "../settings.js";
  import { formatClock } from "../activityAnalysis.js";
  import { formatDateISO, formatDuration, getDaysToEvent, getTodayISO } from "../utils.js";
  import WorkoutCard from "./WorkoutCard.svelte";

  /** The top of the plan on a phone: where you are, and what's on today. */
  interface Props {
    plan: TrainingPlan;
    activitiesByDate: Record<string, RecordedActivity[]>;
    feedback: Record<string, WorkoutFeedback>;
    prediction: RacePrediction | null;
    settings: Settings;
    onWorkoutClick: (workout: Workout, day: TrainingDay) => void;
  }

  let { plan, activitiesByDate, feedback, prediction, settings, onWorkoutClick }: Props = $props();

  const today = getTodayISO();
  const days = $derived(plan.weeks?.flatMap((w) => w.days ?? []) ?? []);
  const todayDay = $derived(days.find((d) => d.date === today));
  const todayWorkouts = $derived(todayDay?.workouts ?? []);
  const recorded = $derived(matchDay(todayWorkouts, activitiesByDate[today] ?? []));
  const currentWeek = $derived(
    plan.weeks?.find((w) => w.startDate <= today && today <= w.endDate) ?? null
  );
  const daysToRace = $derived(getDaysToEvent(plan.meta?.eventDate ?? ""));

  // The next session that isn't rest, after today.
  const next = $derived.by(() => {
    for (const day of days) {
      if (day.date <= today) continue;
      const workout = day.workouts?.find((w) => w.sport !== "rest");
      if (workout) return { day, workout };
    }
    return null;
  });

  function dayLabel(iso: string): string {
    const tomorrow = new Date(`${today}T00:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (iso === formatDateISO(tomorrow)) return "Tomorrow";
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
  }

  const todayLabel = new Date(`${today}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
</script>

<section class="today-card">
  <div class="stats">
    <div class="stat">
      <span class="value num accent">{Math.max(0, daysToRace)}</span>
      <span class="label">days to go</span>
    </div>
    {#if currentWeek}
      <div class="stat">
        <span class="value num"
          >{currentWeek.weekNumber}<small>/{plan.meta?.totalWeeks ?? plan.weeks.length}</small
          ></span
        >
        <span class="label">week</span>
      </div>
    {/if}
    {#if prediction?.current.seconds}
      <div class="stat">
        <span class="value num">{formatClock(prediction.current.seconds)}</span>
        <span class="label">predicted</span>
      </div>
    {/if}
  </div>

  {#if todayDay}
    <div class="today">
      <div class="heading">
        <span class="eyebrow">Today</span>
        <span class="date">{todayLabel}</span>
      </div>
      {#if todayWorkouts.length > 0}
        <div class="workouts">
          {#each todayWorkouts as workout (workout.id)}
            <WorkoutCard
              {workout}
              isCompleted={!!workout.completed}
              feedback={feedback[workout.id]}
              recorded={recorded.byWorkout[workout.id]}
              {settings}
              onClick={() => onWorkoutClick(workout, todayDay)}
            />
          {/each}
        </div>
      {:else}
        <p class="rest">Nothing planned - rest day.</p>
      {/if}
    </div>
  {/if}

  {#if next}
    <button class="next" onclick={() => onWorkoutClick(next.workout, next.day)}>
      <span class="eyebrow">Next · {dayLabel(next.day.date)}</span>
      <span class="next-name">{next.workout.name}</span>
      {#if next.workout.durationMinutes}
        <span class="next-time num">{formatDuration(next.workout.durationMinutes)}</span>
      {/if}
    </button>
  {/if}
</section>

<style>
  .today-card {
    display: none;
  }

  @media (max-width: 800px) {
    .today-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1rem;
    }
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.75rem 0.8rem;
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
  }

  .value {
    font-size: 1.45rem;
    font-weight: 650;
    line-height: 1.1;
  }

  .value.accent {
    color: var(--accent);
  }

  .value small {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .label,
  .eyebrow {
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-muted);
  }

  .today {
    padding: 1rem;
    border-radius: var(--radius-lg);
    background: var(--bg-secondary);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .heading .eyebrow {
    color: var(--accent);
  }

  .date {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .workouts {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .rest {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }

  .next {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.15rem 0.75rem;
    padding: 0.8rem 1rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
    background: var(--bg-secondary);
    color: var(--text-primary);
    text-align: left;
  }

  .next .eyebrow {
    grid-column: 1 / -1;
  }

  .next-name {
    font-weight: 550;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .next-time {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
</style>
