<script lang="ts">
  import type {
    TrainingDay,
    TrainingPlan,
    TrainingWeek,
    Workout,
  } from "../../schema/training-plan.js";
  import { matchDay, type RecordedActivity, type WorkoutFeedback } from "../trainingLog.js";
  import type { Settings } from "../settings.js";
  import type { WeekReview, ReviewFlag } from "../weekReview.js";
  import { formatSpeed, speedDisplay } from "../activityAnalysis.js";
  import { getI18n } from "../i18n/index.js";
  import { activityParts, distance } from "../format.js";
  import { getTodayISO } from "../utils.js";
  import SessionBlock from "./SessionBlock.svelte";

  /**
   * One week of the plan: its phase and volume, how it's going against the
   * plan, and the sessions day by day - seven columns on a wide screen, a
   * list from today on a phone. Sessions drag from one day to another.
   */
  interface Props {
    plan: TrainingPlan;
    /** The week on show (bindable: the plan strip picks it too). */
    selected: number;
    activitiesByDate: Record<string, RecordedActivity[]>;
    feedback: Record<string, WorkoutFeedback>;
    settings: Settings;
    weekReviews: Record<number, WeekReview>;
    onWorkoutClick: (workout: Workout, day: TrainingDay) => void;
    onWorkoutMove: (workoutId: string, newDate: string) => void;
    onAddWorkout: (day: TrainingDay) => void;
    onActivityClick: (activity: RecordedActivity) => void;
    onReviewWeek: (week: TrainingWeek) => void;
  }

  let {
    plan,
    selected = $bindable(),
    activitiesByDate,
    feedback,
    settings,
    weekReviews,
    onWorkoutClick,
    onWorkoutMove,
    onAddWorkout,
    onActivityClick,
    onReviewWeek,
  }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const today = getTodayISO();
  const weeks = $derived(plan.weeks ?? []);
  const week = $derived(weeks.find((w) => w.weekNumber === selected) ?? weeks[0]);
  const current = $derived(
    weeks.find((w) => w.startDate <= today && today <= w.endDate)?.weekNumber ?? null
  );
  const first = $derived(weeks[0]?.weekNumber ?? 1);
  const last = $derived(weeks[weeks.length - 1]?.weekNumber ?? 1);
  const review = $derived(week ? weekReviews[week.weekNumber] : undefined);

  const phaseName = $derived.by(() => {
    if (!week) return "";
    const phase = plan.phases?.find(
      (p) => p.startWeek <= week.weekNumber && week.weekNumber <= p.endWeek
    );
    return phase?.name ?? week.phase ?? "";
  });

  const plannedMinutes = $derived(
    (week?.days ?? [])
      .flatMap((d) => d.workouts ?? [])
      .filter((w) => w.sport !== "rest" && w.sport !== "race")
      .reduce((sum, w) => sum + (w.durationMinutes ?? 0), 0)
  );

  function select(n: number) {
    if (weeks.some((w) => w.weekNumber === n)) selected = n;
  }

  // Phones: swipe sideways to change week. Only clearly horizontal swipes,
  // so scrolling the page never flips the week.
  let touchStart: { x: number; y: number } | null = null;
  function onTouchStart(e: TouchEvent) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: TouchEvent) {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) select(selected + (dx < 0 ? 1 : -1));
  }

  let dragOver = $state<string | null>(null);
  function drop(e: DragEvent, date: string) {
    e.preventDefault();
    dragOver = null;
    const id = e.dataTransfer?.getData("text/plain");
    if (id) onWorkoutMove(id, date);
  }

  let noteOpen = $state(false);

  function flagText(f: ReviewFlag): string {
    if (f.code === "acwr") return m.week.flags.acwr(fmt.number(f.n, 1));
    return (m.week.flags[f.code] as (n: number) => string)(f.n);
  }

  /** Days in the order a phone shows them: today on, then the earlier ones. */
  const agenda = $derived.by(() => {
    const days = week?.days ?? [];
    if (week?.weekNumber !== current) return { ahead: days, earlier: [] };
    return {
      ahead: days.filter((d) => d.date >= today),
      earlier: days.filter((d) => d.date < today),
    };
  });
</script>

{#snippet day(d: TrainingDay, list: boolean)}
  {@const recorded = matchDay(d.workouts ?? [], activitiesByDate[d.date] ?? [])}
  {@const isToday = d.date === today}
  <div
    class="day"
    class:list
    class:today={isToday}
    class:past={d.date < today}
    class:drag-over={dragOver === d.date}
    ondragover={(e) => {
      e.preventDefault();
      dragOver = d.date;
    }}
    ondragleave={() => (dragOver = null)}
    ondrop={(e) => drop(e, d.date)}
    role="group"
    aria-label={fmt.date(d.date, "long")}
  >
    <div class="head">
      <span><b>{fmt.date(d.date, "weekday")}</b> {Number(d.date.slice(8))}</span>
      {#if isToday}<span class="today-label">{m.week.today}</span>{/if}
      {#if list}
        <button class="add-head" onclick={() => onAddWorkout(d)} aria-label={m.week.addWorkout}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      {/if}
    </div>
    <div class="sessions">
      {#each d.workouts ?? [] as workout (workout.id)}
        <SessionBlock
          {workout}
          feedback={feedback[workout.id]}
          recorded={recorded.byWorkout[workout.id]}
          missed={d.date < today &&
            workout.sport !== "rest" &&
            !workout.completed &&
            !recorded.byWorkout[workout.id]?.length}
          {settings}
          onClick={() => onWorkoutClick(workout, d)}
        />
      {:else}
        <div class="empty">{m.week.rest}</div>
      {/each}
      {#each recorded.unplanned as activity (activity.id)}
        {@const p = activityParts(activity, settings, fmt)}
        <button class="unplanned" onclick={() => onActivityClick(activity)}>
          <span class="micro">{m.week.notInPlan}</span>
          <span class="unplanned-name">{activity.name ?? activity.sportType}</span>
          <span class="micro">{m.session.summary(p.distance, p.time, p.heartrate)}</span>
        </button>
      {/each}
      <button
        class="add"
        class:hidden={list}
        onclick={() => onAddWorkout(d)}
        aria-label={m.week.addWorkout}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  </div>
{/snippet}

{#if week}
  <section class="week" aria-label={m.week.title(week.weekNumber)}>
    <header>
      <div class="nav">
        <button
          class="btn btn-ghost btn-icon btn-sm"
          onclick={() => select(selected - 1)}
          disabled={selected <= first}
          aria-label={m.week.previous}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div class="titles">
          <h2 class="title-m">
            {phaseName
              ? m.week.titleWithPhase(phaseName, week.weekNumber)
              : m.week.title(week.weekNumber)}
          </h2>
          <span class="small muted"
            >{fmt.date(week.startDate, "short")} – {fmt.date(week.endDate, "short")}</span
          >
          {#if week.focus}<span class="small muted focus">{week.focus}</span>{/if}
        </div>
        <button
          class="btn btn-ghost btn-icon btn-sm"
          onclick={() => select(selected + 1)}
          disabled={selected >= last}
          aria-label={m.week.next}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
        {#if current !== null && selected !== current}
          <button class="btn btn-sm" onclick={() => select(current)}>{m.week.backToThis}</button>
        {/if}
      </div>
      <div class="volume">
        {#if review}
          <span class="figure-m">{fmt.duration(review.minutes.actual) || "0 min"}</span>
          <span class="small muted">{m.week.ofPlanned(fmt.duration(review.minutes.planned))}</span>
        {:else}
          <span class="figure-m">{fmt.duration(plannedMinutes)}</span>
          <span class="small muted">{m.week.planned}</span>
        {/if}
      </div>
    </header>

    {#if review}
      <div class="review">
        <dl class="stats">
          <div>
            <dt>{m.week.stats.sessions}</dt>
            <dd>
              {review.sessions.done}<span class="of">/{review.sessions.planned}</span>
            </dd>
          </div>
          {#if review.runKm.actual > 0 || review.runKm.planned}
            <div>
              <dt>{m.week.stats.run}</dt>
              <dd>
                {distance(review.runKm.actual * 1000, "run", settings, fmt) ||
                  "0"}{#if review.runKm.planned}<span class="of"
                    >/{distance(review.runKm.planned * 1000, "run", settings, fmt)}</span
                  >{/if}
              </dd>
            </div>
          {/if}
          {#if review.easyRuns?.pace}
            <div>
              <dt>{m.week.stats.easy}</dt>
              <dd>
                {formatSpeed(
                  1000 / review.easyRuns.pace,
                  speedDisplay("run", settings)
                )}{#if review.easyRuns.heartrate}<span class="of">
                    · {Math.round(review.easyRuns.heartrate)} bpm</span
                  >{/if}
              </dd>
            </div>
          {/if}
          {#if review.feedback.averageRpe}
            <div>
              <dt>{m.week.stats.effort}</dt>
              <dd>{fmt.number(review.feedback.averageRpe, 1)}<span class="of">/10</span></dd>
            </div>
          {/if}
          {#if review.recovery?.sleepScore}
            <div>
              <dt>{m.week.stats.sleep}</dt>
              <dd>{Math.round(review.recovery.sleepScore)}</dd>
            </div>
          {/if}
        </dl>
        {#if review.flags.length}
          <ul class="flags">
            {#each review.flags as f (f.code)}
              <li class:warning={f.level === "warning"}>{flagText(f)}</li>
            {/each}
          </ul>
        {/if}
        <div class="review-actions">
          {#if review.coachNote}
            <button
              class="btn btn-ghost btn-sm"
              aria-expanded={noteOpen}
              onclick={() => (noteOpen = !noteOpen)}>{m.week.coachNote}</button
            >
          {/if}
          <button class="btn btn-sm" onclick={() => onReviewWeek(week)}>{m.week.review}</button>
        </div>
        {#if review.coachNote && noteOpen}
          <div class="note">
            <p>{review.coachNote.summary}</p>
            {#if review.coachNote.focus}
              <p><b>{m.week.focus}.</b> {review.coachNote.focus}</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#key week.weekNumber}
      <div
        class="grid"
        role="group"
        aria-label={m.week.days}
        ontouchstart={onTouchStart}
        ontouchend={onTouchEnd}
      >
        {#each week.days ?? [] as d (d.date)}
          {@render day(d, false)}
        {/each}
      </div>
      <div
        class="agenda"
        ontouchstart={onTouchStart}
        ontouchend={onTouchEnd}
        role="group"
        aria-label={m.week.days}
      >
        {#each agenda.ahead as d (d.date)}
          {@render day(d, true)}
        {/each}
        {#if agenda.earlier.length}
          <div class="small muted earlier">{m.week.earlier}</div>
          {#each agenda.earlier as d (d.date)}
            {@render day(d, true)}
          {/each}
        {/if}
      </div>
    {/key}
  </section>
{/if}

<style>
  .week {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .nav svg,
  .add svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .volume {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    white-space: nowrap;
  }

  .review {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) 0;
  }
  .stats div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 var(--space-6);
    border-left: 1px solid var(--line);
  }
  .stats div:first-child {
    padding-left: 0;
    border-left: 0;
  }
  .stats dt {
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
  }
  .stats dd {
    font-size: 18px;
    line-height: 22px;
    font-weight: 700;
    font-variation-settings: "wdth" 80;
    font-variant-numeric: tabular-nums;
  }
  .of {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-muted);
  }
  .flags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    list-style: none;
  }
  .flags li {
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--sunk);
    font-size: 12px;
    line-height: 18px;
    font-weight: 600;
    color: var(--ink-muted);
  }
  .flags li.warning {
    background: var(--warning-soft);
    color: var(--warning);
  }
  .review-actions {
    display: flex;
    gap: var(--space-2);
  }
  .note {
    flex-basis: 100%;
    max-width: 70ch;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: 14px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .agenda {
    display: none;
  }
  .day {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    padding-top: var(--space-2);
    border-top: 2px solid var(--line);
  }
  .day.today {
    border-top-color: var(--signal);
  }
  .day.drag-over .sessions {
    outline: 2px dashed var(--signal);
    outline-offset: 2px;
    border-radius: var(--radius-s);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-1);
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-muted);
  }
  .head b {
    font-weight: 650;
    color: var(--ink);
  }
  .day.past .head {
    opacity: 0.75;
  }
  .today .head,
  .today .head b,
  .today-label {
    color: var(--signal);
  }
  .sessions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 56px;
  }
  .empty {
    padding: 10px var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    font-size: 13px;
    color: var(--ink-muted);
  }
  .unplanned {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-s);
    background: none;
    color: var(--ink-muted);
    text-align: left;
    font: inherit;
  }
  .unplanned-name {
    font-size: 13px;
    font-weight: 650;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .add {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    border: 1px dashed transparent;
    border-radius: var(--radius-s);
    background: none;
    color: var(--ink-muted);
    opacity: 0;
    transition: opacity var(--transition-fast);
  }
  .day:hover .add,
  .add:focus-visible {
    opacity: 1;
    border-color: var(--line-strong);
  }

  @media (max-width: 640px) {
    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3) var(--space-4);
      width: 100%;
    }
    .stats div {
      padding: 0;
      border-left: 0;
    }
  }
  @media (max-width: 900px) {
    .grid {
      display: none;
    }
    .agenda {
      display: flex;
      flex-direction: column;
    }
    .day.list {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      gap: var(--space-3);
      padding: var(--space-2) 0;
      border-top-width: 1px;
    }
    .day.list .head {
      flex-direction: column;
      align-items: flex-start;
    }
    .day.list .sessions {
      min-height: 0;
    }
    .day.list .head {
      justify-content: flex-start;
      gap: 2px;
    }
    .add.hidden {
      display: none;
    }
    .add-head {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin-left: -8px;
      border: 0;
      border-radius: var(--radius-s);
      background: none;
      color: var(--ink-muted);
    }
    .add-head svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
    .earlier {
      padding: var(--space-4) 0 var(--space-2);
    }
  }
</style>
