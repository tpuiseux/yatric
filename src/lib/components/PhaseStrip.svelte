<script lang="ts">
  import type { TrainingPlan, TrainingWeek } from "../../schema/training-plan.js";
  import type { WeekReview } from "../weekReview.js";
  import { getI18n } from "../i18n/index.js";
  import { getTodayISO } from "../utils.js";

  /**
   * The whole plan on one line: a bar per week, as tall as its planned
   * volume, filled with what was done, the phases named underneath. A bar
   * opens its week.
   */
  interface Props {
    plan: TrainingPlan;
    weekReviews: Record<number, WeekReview>;
    onSelect: (weekNumber: number) => void;
  }

  let { plan, weekReviews, onSelect }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const MAX_HEIGHT = 120;
  const today = getTodayISO();
  const weeks = $derived(plan.weeks ?? []);

  function planned(w: TrainingWeek): number {
    return (w.days ?? [])
      .flatMap((d) => d.workouts ?? [])
      .filter((x) => x.sport !== "rest")
      .reduce((sum, x) => sum + (x.durationMinutes ?? 0), 0);
  }

  const bars = $derived.by(() => {
    const rows = weeks.map((w) => ({
      week: w,
      planned: planned(w),
      done: weekReviews[w.weekNumber]?.minutes.actual ?? 0,
      current: w.startDate <= today && today <= w.endDate,
      race: (w.days ?? []).some((d) => d.workouts?.some((x) => x.sport === "race")),
    }));
    const top = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.done)));
    return rows.map((r) => ({
      ...r,
      height: Math.max(8, (r.planned / top) * MAX_HEIGHT),
      fill: Math.min(1, r.planned ? r.done / r.planned : 0),
    }));
  });

  const phases = $derived(
    (plan.phases ?? []).filter((p) => p.endWeek >= p.startWeek && p.startWeek >= 1)
  );
</script>

<div class="strip" style:--weeks={weeks.length}>
  <div class="bars">
    {#each bars as b (b.week.weekNumber)}
      <button
        class="week"
        class:current={b.current}
        class:race={b.race}
        style:grid-column={b.week.weekNumber}
        aria-label={m.plan.weekBar(
          b.week.weekNumber,
          fmt.duration(b.planned) || "0 min",
          fmt.duration(b.done) || "0 min"
        )}
        title={m.plan.weekBar(
          b.week.weekNumber,
          fmt.duration(b.planned) || "0 min",
          fmt.duration(b.done) || "0 min"
        )}
        onclick={() => onSelect(b.week.weekNumber)}
      >
        <span class="bar" style:height="{b.height}px">
          <span class="done" style:height="{b.fill * 100}%"></span>
        </span>
        <span class="n">{b.week.weekNumber}</span>
      </button>
    {/each}
  </div>
  {#if phases.length}
    <div class="phases">
      {#each phases as p (p.name + p.startWeek)}
        <span style:grid-column="{p.startWeek} / {p.endWeek + 1}" title={p.name}>{p.name}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .strip {
    overflow-x: auto;
    padding-bottom: var(--space-1);
  }
  .bars,
  .phases {
    display: grid;
    grid-template-columns: repeat(var(--weeks), minmax(28px, 1fr));
    gap: var(--space-1);
    min-width: calc(var(--weeks) * 32px);
  }
  .bars {
    align-items: end;
  }
  .week {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
  }
  .bar {
    position: relative;
    display: block;
    border: 1px solid var(--line-strong);
    border-bottom: 0;
    border-radius: var(--radius-s) var(--radius-s) 0 0;
    overflow: hidden;
  }
  .done {
    position: absolute;
    inset: auto 0 0;
    background: color-mix(in srgb, var(--line-strong) 45%, transparent);
  }
  .week:hover .bar {
    border-color: var(--ink);
  }
  .current .bar {
    border-color: var(--signal);
    background: var(--signal-soft);
  }
  .current .done {
    background: var(--signal);
  }
  .race .bar {
    border-color: var(--race);
  }
  .n {
    font-size: 12px;
    line-height: 16px;
    text-align: center;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .current .n {
    color: var(--signal);
    font-weight: 700;
  }
  .phases {
    margin-top: var(--space-2);
  }
  .phases span {
    padding-top: var(--space-1);
    border-top: 1px solid var(--line-strong);
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
