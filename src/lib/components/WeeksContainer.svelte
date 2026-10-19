<script lang="ts">
  import { untrack } from "svelte";
  import type {
    TrainingPlan,
    TrainingDay,
    TrainingWeek,
    Workout,
  } from "../../schema/training-plan.js";
  import type { RecordedActivity, WorkoutFeedback } from "../trainingLog.js";
  import type { Settings } from "../settings.js";
  import WeekCard from "./WeekCard.svelte";
  import WeekNav from "./WeekNav.svelte";
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

  const weeks = $derived(plan.weeks ?? []);

  const currentWeek = $derived(
    weeks.find((w) => w.startDate <= today && today <= w.endDate)?.weekNumber ?? null
  );

  // The plan opens on this week; before it starts, on week 1; after race
  // day, on the last week.
  function defaultWeek(): number {
    if (currentWeek !== null) return currentWeek;
    if (weeks.length && today > weeks[weeks.length - 1].endDate) {
      return weeks[weeks.length - 1].weekNumber;
    }
    return weeks[0]?.weekNumber ?? 1;
  }

  let selected = $state(untrack(defaultWeek));
  const week = $derived(weeks.find((w) => w.weekNumber === selected) ?? weeks[0]);

  function select(n: number) {
    if (!weeks.some((w) => w.weekNumber === n)) return;
    selected = n;
  }

  // Phones: swipe sideways to change week. Only clearly horizontal swipes,
  // so scrolling the page never flips the week.
  let touchStart: { x: number; y: number } | null = null;

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: TouchEvent) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) {
      select(selected + (dx < 0 ? 1 : -1));
    }
  }
</script>

<WeekNav {weeks} phases={plan.phases ?? []} {selected} current={currentWeek} onSelect={select} />

{#if week}
  <div
    class="week-swipe"
    role="group"
    aria-label="Week {week.weekNumber}"
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
  >
    {#key week.weekNumber}
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
        animationDelay={0}
      />
    {/key}
  </div>
{/if}
