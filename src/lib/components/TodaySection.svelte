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
  import RecoverySignals from "./RecoverySignals.svelte";

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

<section class="today">
  <div class="now">
    <span class="small muted">{m.today.heading(fmt.date(today, "long"))}</span>
    {#if !todayDay}
      <span class="figure-l">{m.today.rest}</span>
      <p>
        {today < firstDate
          ? m.today.beforePlan(fmt.date(firstDate, "dayMonth"))
          : m.today.afterPlan}
      </p>
    {:else if sessions.length === 0}
      <span class="figure-l">{m.today.rest}</span>
      {#if restNotes.some((w) => !GENERIC_REST.test(w.name ?? ""))}
        <p class="muted">
          {restNotes
            .map((w) => w.name)
            .filter((n) => !GENERIC_REST.test(n ?? ""))
            .join(", ")}
        </p>
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
        {m.today.next(
          when(next.day.date),
          [next.workout.name, fmt.duration(next.workout.durationMinutes)].filter(Boolean).join(", ")
        )}
      </button>
    {/if}
  </div>

  <RaceBib {plan} />

  {#if prediction}
    <RacePrediction {prediction} {settings} compact />
  {/if}

  <div class="signals">
    <RecoverySignals days={recoveryDays} {onAskCoach} />
  </div>
</section>

<style>
  .today {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(200px, 240px) minmax(180px, 240px);
    gap: var(--space-6) var(--space-8);
    align-items: start;
  }
  .now {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    min-width: 0;
  }
  .sessions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    max-width: 420px;
  }
  .next {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 3px;
  }
  .next:hover {
    text-decoration-color: var(--ink);
  }
  .signals {
    grid-column: 1 / -1;
  }
  .signals:empty {
    display: none;
  }

  @media (max-width: 1100px) {
    .today {
      grid-template-columns: minmax(0, 1fr) minmax(180px, 220px);
    }
  }
  @media (max-width: 640px) {
    .today {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--space-4);
    }
    .now,
    .signals {
      grid-column: 1 / -1;
    }
  }
</style>
