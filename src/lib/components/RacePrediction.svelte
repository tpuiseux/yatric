<script lang="ts">
  import type { Estimate, RacePrediction } from "../racePrediction.js";
  import type { Settings } from "../settings.js";
  import { formatClock, formatSpeed, speedDisplay } from "../activityAnalysis.js";
  import { getI18n } from "../i18n/index.js";

  /**
   * The predicted race time. Compact: the time, its trend and the goal, for
   * the top of the week. Full: the weekly curve and how it's worked out.
   */
  interface Props {
    prediction: RacePrediction;
    settings: Settings;
    compact?: boolean;
  }

  let { prediction, settings, compact = false }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const display = $derived(speedDisplay("run", settings));
  const seconds = $derived(prediction.current.seconds);
  const goal = $derived(prediction.target.goalSeconds);
  const distance = $derived(prediction.target.distanceMeters);

  // The change over the last four weeks (or since the first point, if newer).
  const trend = $derived.by(() => {
    const h = prediction.history;
    if (seconds === null || h.length < 2) return null;
    const cutoff = new Date(Date.parse(`${prediction.current.date}T00:00:00Z`) - 28 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const from = [...h].reverse().find((p) => p.date <= cutoff) ?? h[0];
    if (from.date === prediction.current.date) return null;
    return { change: seconds - from.seconds, since: from.date };
  });

  const trendText = $derived.by(() => {
    if (!trend) return null;
    const since = fmt.date(trend.since, "dayMonth");
    if (Math.abs(trend.change) < 15) return { text: m.prediction.steady(since), good: null };
    const gap = formatClock(Math.abs(trend.change));
    return trend.change < 0
      ? { text: m.prediction.faster(gap, since), good: true }
      : { text: m.prediction.slower(gap, since), good: false };
  });

  /** "Goal 3:12:00 (4:33/km): 9:41 still to find". */
  const goalLine = $derived.by(() => {
    if (goal === null || seconds === null) return "";
    return m.prediction.goal(
      formatClock(goal),
      formatSpeed(distance / goal, display),
      Math.abs(seconds - goal) < 30
        ? m.prediction.onTarget
        : seconds > goal
          ? m.prediction.behind(formatClock(seconds - goal))
          : m.prediction.ahead(formatClock(goal - seconds))
    );
  });

  function estimateDetail(e: Estimate): string {
    switch (e.kind) {
      case "effort":
        return m.prediction.effortDetail(
          fmt.number(e.effort.distanceMeters / 1000, 1),
          formatClock(e.effort.seconds),
          fmt.date(e.effort.date, "short")
        );
      case "heartRate":
        return m.prediction.heartRateDetail(
          formatSpeed(e.speed, display),
          Math.round(e.hr),
          e.splits
        );
      case "volume":
        return m.prediction.volumeDetail(
          Math.round(e.kmPerWeek),
          formatSpeed(1000 / e.paceSecondsPerKm, display)
        );
      case "vo2max":
        return m.prediction.vo2maxDetail(fmt.number(e.vo2max, 1), fmt.date(e.date, "short"));
    }
  }

  // The weekly curve. Faster times plot higher, like a rising form curve.
  const W = 480;
  const H = 120;
  const PAD = 10;
  const chart = $derived.by(() => {
    const h = prediction.history;
    if (h.length < 2) return null;
    const values = h.map((p) => p.seconds);
    if (goal !== null) values.push(goal);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    // At least two minutes of range, so noise doesn't look like a cliff.
    const span = Math.max(hi - lo, 120);
    const mid = (hi + lo) / 2;
    lo = mid - span / 2;
    hi = mid + span / 2;
    const x = (i: number) => PAD + (i / (h.length - 1)) * (W - 2 * PAD);
    const y = (s: number) => PAD + ((s - lo) / (hi - lo)) * (H - 2 * PAD);
    const points = h.map((p, i) => ({ ...p, x: x(i), y: y(p.seconds) }));
    return {
      points,
      path: points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(""),
      goalY: goal !== null ? y(goal) : null,
    };
  });

  let hovered = $state<number | null>(null);
</script>

<section class="prediction" class:compact aria-label={m.plan.prediction}>
  <span class="label">{m.prediction.label}</span>
  {#if seconds === null}
    <p class="empty">{m.prediction.empty}</p>
  {:else}
    {#if compact}
      <span class="figure-l">{formatClock(seconds)}</span>
      <span class="meta">
        <span class="small muted num">{formatSpeed(distance / seconds, display)}</span>
        {#if goal !== null}
          <span
            class="chip-gap"
            class:behind={seconds - goal >= 30}
            class:ahead={goal - seconds >= 30}
            title={goalLine}
          >
            {Math.abs(seconds - goal) < 30
              ? m.prediction.gapOnTarget
              : seconds > goal
                ? m.prediction.gapBehind(formatClock(seconds - goal))
                : m.prediction.gapAhead(formatClock(goal - seconds))}
          </span>
        {/if}
      </span>
    {:else}
      <span class="figure-l big">{formatClock(seconds)}</span>
      <span class="label">{m.prediction.pace(formatSpeed(distance / seconds, display))}</span>
      {#if trendText}
        <span
          class="trend"
          class:good={trendText.good === true}
          class:bad={trendText.good === false}>{trendText.text}</span
        >
      {/if}
      {#if goal !== null}
        <span class="label">{goalLine}</span>
      {/if}
    {/if}

    {#if !compact}
      {#if chart}
        <div class="chart">
          <svg
            viewBox="0 0 {W} {H}"
            width="100%"
            role="img"
            aria-label={m.prediction.chart}
            onmouseleave={() => (hovered = null)}
          >
            {#if chart.goalY !== null}
              <line class="goal" x1="0" x2={W} y1={chart.goalY} y2={chart.goalY} />
            {/if}
            <path class="line" d={chart.path} />
            {#each chart.points as p, i (p.date)}
              {#if i === chart.points.length - 1 || hovered === i}
                <circle class="dot" cx={p.x} cy={p.y} r="4" />
              {/if}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <rect
                class="hit"
                x={p.x - W / chart.points.length / 2}
                y="0"
                width={W / chart.points.length}
                height={H}
                onmouseenter={() => (hovered = i)}
              />
            {/each}
          </svg>
          <div class="caption">
            {#if hovered !== null}
              {fmt.date(chart.points[hovered].date, "short")}, {formatClock(
                chart.points[hovered].seconds
              )}
            {/if}
          </div>
        </div>
      {/if}

      <details>
        <summary>{m.prediction.howEstimated}</summary>
        <ul>
          {#each prediction.current.estimates as e (e.kind)}
            <li>
              <div class="row">
                <span>{m.prediction.estimates[e.kind]}</span>
                <span class="num">{formatClock(e.seconds)}</span>
              </div>
              <div class="detail">{estimateDetail(e)}</div>
            </li>
          {/each}
        </ul>
        <p class="note">{m.prediction.note}</p>
      </details>
    {/if}
  {/if}
</section>

<style>
  .prediction {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .label {
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-muted);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin-top: var(--space-1);
  }
  .chip-gap {
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--sunk);
    font-size: 12px;
    line-height: 16px;
    font-weight: 650;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .chip-gap.behind {
    background: var(--warning-soft);
    color: var(--warning);
  }
  .chip-gap.ahead {
    background: var(--success-soft);
    color: var(--success);
  }
  .trend {
    font-size: 13px;
    line-height: 18px;
    font-weight: 600;
  }
  .trend.good {
    color: var(--success);
  }
  .trend.bad {
    color: var(--warning);
  }
  .empty {
    max-width: 40ch;
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-muted);
  }
  .big {
    font-size: 72px;
  }

  .chart {
    margin-top: var(--space-4);
    max-width: 560px;
  }
  .chart svg {
    display: block;
    overflow: visible;
  }
  .line {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .goal {
    stroke: var(--line-strong);
    stroke-dasharray: 4 4;
    vector-effect: non-scaling-stroke;
  }
  .dot {
    fill: var(--signal);
  }
  .hit {
    fill: transparent;
  }
  .caption {
    min-height: 18px;
    font-size: 12px;
    color: var(--ink-muted);
  }

  details {
    margin-top: var(--space-4);
    max-width: 560px;
    font-size: 14px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--ink);
  }
  ul {
    list-style: none;
    margin-top: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    font-weight: 600;
  }
  .detail,
  .note {
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-muted);
  }
  .note {
    margin-top: var(--space-3);
  }
</style>
