<script lang="ts">
  import type { TrainingDay, TrainingPlan, Workout } from "../../schema/training-plan.js";
  import { matchDay, type RecordedActivity, type WorkoutFeedback } from "../trainingLog.js";
  import type { RacePrediction as Prediction } from "../racePrediction.js";
  import type { Settings } from "../settings.js";
  import type { LoadDay } from "../load.js";
  import { getI18n } from "../i18n/index.js";
  import { getTodayISO } from "../utils.js";
  import SessionBlock from "./SessionBlock.svelte";
  import RaceBib from "./RaceBib.svelte";
  import RacePrediction from "./RacePrediction.svelte";
  import RecoveryStatus from "./RecoveryStatus.svelte";

  /**
   * The top of the plan, the question the app is opened for: what's on
   * today, what the body says this morning, and how far the race is.
   */
  interface Props {
    plan: TrainingPlan;
    activitiesByDate: Record<string, RecordedActivity[]>;
    feedback: Record<string, WorkoutFeedback>;
    prediction: Prediction | null;
    settings: Settings;
    recoveryDays: LoadDay[];
    onWorkoutClick: (workout: Workout, day: TrainingDay) => void;
    onAskCoach: (text: string) => void;
    onOpenRecovery: () => void;
  }

  let {
    plan,
    activitiesByDate,
    feedback,
    prediction,
    settings,
    recoveryDays,
    onWorkoutClick,
    onAskCoach,
    onOpenRecovery,
  }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const today = getTodayISO();
  const days = $derived(plan.weeks?.flatMap((w) => w.days ?? []) ?? []);
  const todayDay = $derived(days.find((d) => d.date === today));
  const sessions = $derived((todayDay?.workouts ?? []).filter((w) => w.sport !== "rest"));
  const restNotes = $derived((todayDay?.workouts ?? []).filter((w) => w.sport === "rest"));
  const recorded = $derived(matchDay(todayDay?.workouts ?? [], activitiesByDate[today] ?? []));

  // The next session that isn't rest, after today.
  const next = $derived.by(() => {
    for (const day of days) {
      if (day.date <= today) continue;
      const workout = day.workouts?.find((w) => w.sport !== "rest");
      if (workout) return { day, workout };
    }
    return null;
  });

  function when(iso: string): string {
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
    if (iso === tomorrow) return m.today.tomorrow;
    const d = fmt.date(iso, "weekdayLong");
    return d.charAt(0).toUpperCase() + d.slice(1);
  }

  /** A rest day's own name only says something if it isn't just "rest". */
  const GENERIC_REST = /^\s*(rest|repos)(\s+day)?\s*$/i;

  const firstDate = $derived(plan.weeks?.[0]?.startDate ?? "");
</script>

<section class="today" aria-label={m.today.title}>
  <div class="cell now">
    <span class="small muted first-cap">{m.today.heading(fmt.date(today, "long"))}</span>
    {#if !todayDay}
      <span class="figure-l">{m.today.rest}</span>
      <span class="small muted">
        {today < firstDate
          ? m.today.beforePlan(fmt.date(firstDate, "dayMonth"))
          : m.today.afterPlan}
      </span>
    {:else if sessions.length === 0}
      <span class="figure-l">{m.today.rest}</span>
      {#if restNotes.some((w) => !GENERIC_REST.test(w.name ?? ""))}
        <span class="small muted">
          {restNotes
            .map((w) => w.name)
            .filter((n) => !GENERIC_REST.test(n ?? ""))
            .join(", ")}
        </span>
      {/if}
    {:else}
      <div class="sessions">
        {#each sessions as workout (workout.id)}
          <SessionBlock
            {workout}
            feedback={feedback[workout.id]}
            recorded={recorded.byWorkout[workout.id]}
            {settings}
            large
            onClick={() => onWorkoutClick(workout, todayDay)}
          />
        {/each}
      </div>
    {/if}
    {#if next}
      <button class="next" onclick={() => onWorkoutClick(next.workout, next.day)}>
        <span class="muted">{when(next.day.date)}</span>
        <span>{next.workout.name}</span>
        {#if next.workout.durationMinutes}<span class="muted num"
            >{fmt.duration(next.workout.durationMinutes)}</span
          >{/if}
      </button>
    {/if}
  </div>

  <div class="cell bib">
    <RaceBib {plan} compact />
  </div>

  {#if prediction}
    <div class="cell">
      <RacePrediction {prediction} {settings} compact />
    </div>
  {/if}

  <div class="cell">
    <RecoveryStatus days={recoveryDays} onDetails={onOpenRecovery} {onAskCoach} />
  </div>
</section>

<style>
  .today {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(170px, 0.9fr) minmax(0, 1fr) minmax(0, 1fr);
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--sheet);
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-6);
  }
  .cell + .cell {
    border-left: 1px solid var(--line);
  }
  .bib {
    padding: var(--space-4);
  }
  .now {
    align-items: flex-start;
  }
  .first-cap::first-letter {
    text-transform: uppercase;
  }
  .sessions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
  }
  .next {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
    margin-top: auto;
    padding: var(--space-2) 0 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 14px;
    text-align: left;
    color: var(--ink);
  }
  .next:hover span:nth-child(2) {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (max-width: 1100px) {
    .today {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .cell + .cell {
      border-left: 0;
    }
    .cell:nth-child(n + 3) {
      border-top: 1px solid var(--line);
    }
    .cell:nth-child(even) {
      border-left: 1px solid var(--line);
    }
  }
  @media (max-width: 640px) {
    .cell {
      padding: var(--space-4);
    }
    .now {
      grid-column: 1 / -1;
      border-bottom: 1px solid var(--line);
    }
    .cell:nth-child(n + 3) {
      border-top: 0;
    }
    .cell:nth-child(even) {
      border-left: 0;
    }
    .cell:nth-child(3) {
      border-left: 1px solid var(--line);
    }
    .cell:nth-child(4) {
      grid-column: 1 / -1;
      border-top: 1px solid var(--line);
    }
  }
</style>
