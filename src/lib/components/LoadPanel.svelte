<script lang="ts">
  import type { LoadDay, LoadSeries } from "../load.js";
  import { getI18n } from "../i18n/index.js";

  /**
   * The Recovery view: training load and its ratio (ACWR), HRV, sleep,
   * readiness and resting heart rate, today's values then day by day.
   */
  interface Props {
    load: LoadSeries;
    planStartDate: string;
  }

  let { load, planStartDate }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const days = $derived(load.days);

  /** The latest day with a value for each measure - today's may not be in yet. */
  function latest<K extends keyof LoadDay>(key: K): LoadDay | null {
    for (let i = days.length - 1; i >= 0; i--) if (days[i][key] !== null) return days[i];
    return null;
  }

  function shortDate(date: string): string {
    return fmt.date(date, "short");
  }

  function hrvStatus(s: string): string {
    return m.recovery.hrvStatus[s.toUpperCase()] ?? s.charAt(0) + s.slice(1).toLowerCase();
  }

  const tiles = $derived.by(() => {
    const t: { label: string; value: string; unit?: string; sub: string }[] = [];
    const a = latest("acwr");
    if (a?.acwr != null) {
      t.push({
        label: m.recovery.acwr,
        value: fmt.number(a.acwr, 2),
        sub:
          a.acwr > 1.5
            ? m.recovery.acwrHigh
            : a.acwr < 0.8
              ? m.recovery.acwrLow
              : m.recovery.acwrInRange,
      });
    }
    const l = latest("acute");
    if (l?.acute != null) {
      t.push({
        label: m.recovery.load,
        value: String(Math.round(l.acute)),
        sub: l.chronic != null ? m.recovery.load4(Math.round(l.chronic)) : "",
      });
    }
    const h = latest("hrv");
    if (h?.hrv != null) {
      t.push({
        label: m.recovery.hrv,
        value: String(Math.round(h.hrv)),
        unit: "ms",
        sub: h.hrvStatus ? hrvStatus(h.hrvStatus) : "",
      });
    }
    const s = latest("sleepScore");
    if (s?.sleepScore != null)
      t.push({ label: m.recovery.sleep, value: String(s.sleepScore), sub: shortDate(s.date) });
    const r = latest("readiness");
    if (r?.readiness != null)
      t.push({ label: m.recovery.readiness, value: String(r.readiness), sub: shortDate(r.date) });
    const rhr = latest("restingHr");
    if (rhr?.restingHr != null)
      t.push({
        label: m.recovery.restingHr,
        value: String(rhr.restingHr),
        unit: "bpm",
        sub: shortDate(rhr.date),
      });
    return t;
  });

  // --- Charts ---------------------------------------------------------------

  interface Series {
    key: string;
    label: string;
    color: string;
    values: (number | null)[];
    kind: "line" | "dots" | "bars";
  }

  interface Panel {
    key: string;
    title: string;
    unit: string;
    series: Series[];
    /** Shaded band and dashed reference line, in data units. */
    band?: [number, number];
    reference?: number;
    domain: [number, number];
    format: (v: number) => string;
  }

  const PANEL_HEIGHT = 92;
  const M = { left: 36, right: 12, top: 8, bottom: 6 };
  let width = $state(0);
  const plotWidth = $derived(Math.max(0, width - M.left - M.right));
  const plotHeight = PANEL_HEIGHT - M.top - M.bottom;

  function domainOf(values: (number | null)[], pad = 0.08, floor?: number): [number, number] {
    const v = values.filter((x): x is number => x !== null);
    if (v.length === 0) return [0, 1];
    let lo = Math.min(...v);
    let hi = Math.max(...v);
    const span = hi - lo || Math.abs(hi) * 0.1 || 1;
    lo -= span * pad;
    hi += span * pad;
    if (floor !== undefined) lo = Math.max(floor, lo);
    return [lo, hi];
  }

  const panels = $derived.by((): Panel[] => {
    const out: Panel[] = [];
    const acute = days.map((d) => d.acute);
    const chronic = days.map((d) => d.chronic);
    if (acute.some((v) => v !== null)) {
      out.push({
        key: "load",
        title: m.recovery.charts.load,
        unit: load.loadSource === "garmin" ? "" : m.recovery.charts.fromActivities,
        series: [
          {
            key: "acute",
            label: m.recovery.charts.acute,
            color: "var(--signal)",
            values: acute,
            kind: "line",
          },
          {
            key: "chronic",
            label: m.recovery.charts.chronic,
            color: "var(--ink-muted)",
            values: chronic,
            kind: "line",
          },
        ],
        domain: domainOf([...acute, ...chronic], 0.08, 0),
        format: (v) => String(Math.round(v)),
      });
    }
    const acwr = days.map((d) => d.acwr);
    if (acwr.some((v) => v !== null)) {
      const [lo, hi] = domainOf([...acwr, 0.8, 1.6]);
      out.push({
        key: "acwr",
        title: "ACWR",
        unit: m.recovery.charts.acwrUnit,
        series: [{ key: "acwr", label: "ACWR", color: "var(--ink)", values: acwr, kind: "line" }],
        band: [0.8, 1.3],
        reference: 1.5,
        domain: [lo, hi],
        format: (v) => v.toFixed(1),
      });
    }
    const hrv = days.map((d) => d.hrv);
    if (hrv.some((v) => v !== null)) {
      const weekly = days.map((d) => d.hrvWeekly);
      out.push({
        key: "hrv",
        title: m.recovery.hrv,
        unit: "ms",
        series: [
          {
            key: "hrv",
            label: m.recovery.charts.hrvNight,
            color: "var(--ink-muted)",
            values: hrv,
            kind: "dots",
          },
          {
            key: "hrvWeekly",
            label: m.recovery.charts.hrvWeek,
            color: "var(--signal)",
            values: weekly,
            kind: "line",
          },
        ],
        domain: domainOf([...hrv, ...weekly]),
        format: (v) => String(Math.round(v)),
      });
    }
    const sleep = days.map((d) => (d.sleepScore === null ? null : d.sleepScore));
    if (sleep.some((v) => v !== null)) {
      out.push({
        key: "sleep",
        title: m.recovery.charts.sleep,
        unit: "",
        series: [
          {
            key: "sleep",
            label: m.recovery.sleep,
            color: "var(--z2)",
            values: sleep,
            kind: "bars",
          },
        ],
        reference: 60,
        domain: [0, 100],
        format: (v) => String(Math.round(v)),
      });
    }
    return out;
  });

  const step = $derived(days.length > 1 ? plotWidth / (days.length - 1) : plotWidth);
  const x = (i: number) => M.left + i * step;
  const y = (p: Panel, v: number) =>
    M.top + plotHeight - ((v - p.domain[0]) / (p.domain[1] - p.domain[0])) * plotHeight;

  function linePath(p: Panel, values: (number | null)[]): string {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p, v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  function ticks(p: Panel): number[] {
    const [lo, hi] = p.domain;
    if (p.key === "acwr") return [1.0, 1.5].filter((t) => t > lo && t < hi);
    if (p.key === "sleep") return [50, 100];
    const raw = (hi - lo) / 2;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const niceStep = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let t = Math.ceil(lo / niceStep) * niceStep; t < hi; t += niceStep) out.push(t);
    return out;
  }

  // Month starts (and the plan's start) along the bottom.
  const xLabels = $derived(
    days
      .map((d, i) => ({ i, date: d.date }))
      .filter(({ date, i }) => date.endsWith("-01") || i === 0)
  );
  const planStartIndex = $derived(days.findIndex((d) => d.date === planStartDate));

  let hoverIndex = $state<number | null>(null);
  function onPointer(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.round((e.clientX - rect.left - M.left) / (step || 1));
    hoverIndex = Math.max(0, Math.min(days.length - 1, i));
  }

  const hover = $derived.by(() => {
    if (hoverIndex === null) return null;
    const d = days[hoverIndex];
    const rows: { label: string; color: string; value: string }[] = [];
    for (const p of panels) {
      for (const s of p.series) {
        const v = s.values[hoverIndex];
        rows.push({
          label: p.series.length > 1 ? `${p.title}, ${s.label}` : p.title,
          color: s.color,
          value: v === null ? "–" : `${p.format(v)}${p.unit && p.key === "hrv" ? " ms" : ""}`,
        });
      }
    }
    if (d.hrvStatus)
      rows.push({
        label: m.recovery.charts.hrvStatus,
        color: "transparent",
        value: hrvStatus(d.hrvStatus),
      });
    if (d.readiness !== null)
      rows.push({ label: m.recovery.readiness, color: "transparent", value: String(d.readiness) });
    return { left: x(hoverIndex), date: d.date, rows };
  });
</script>

<section class="load-panel" aria-label={m.recovery.title}>
  <h2 class="title-m">{m.recovery.title}</h2>
  {#if tiles.length > 0}
    <div class="tiles">
      {#each tiles as tile (tile.label)}
        <div class="tile">
          <span class="tile-label">{tile.label}</span>
          <span class="tile-value"
            ><span class="figure-m">{tile.value}</span>{#if tile.unit}<span class="unit"
                >{tile.unit}</span
              >{/if}</span
          >
          {#if tile.sub}<span class="tile-label">{tile.sub}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if days.length}
    <div class="charts" bind:clientWidth={width}>
      {#if width > 0 && panels.length > 0}
        {#each panels as p (p.key)}
          <div class="panel">
            <div class="panel-title">
              {p.title}
              {#if p.unit}<span class="unit">{p.unit}</span>{/if}
              {#if p.series.length > 1}
                {#each p.series as s (s.key)}
                  <span class="legend"
                    ><span class="swatch" class:dot={s.kind === "dots"} style:background={s.color}
                    ></span>{s.label}</span
                  >
                {/each}
              {/if}
            </div>
            <svg
              {width}
              height={PANEL_HEIGHT}
              role="img"
              aria-label={m.recovery.charts.dayByDay(p.title)}
              onpointermove={onPointer}
              onpointerdown={onPointer}
              onpointerleave={() => (hoverIndex = null)}
            >
              {#if p.band}
                {@const top = y(p, Math.min(p.band[1], p.domain[1]))}
                {@const bottom = y(p, Math.max(p.band[0], p.domain[0]))}
                <rect
                  class="band"
                  x={M.left}
                  y={top}
                  width={plotWidth}
                  height={Math.max(0, bottom - top)}
                />
              {/if}
              {#each ticks(p) as t (t)}
                <line class="grid" x1={M.left} x2={M.left + plotWidth} y1={y(p, t)} y2={y(p, t)} />
                <text class="axis" x={M.left - 6} y={y(p, t) + 3} text-anchor="end"
                  >{p.format(t)}</text
                >
              {/each}
              {#if p.reference !== undefined && p.reference > p.domain[0] && p.reference < p.domain[1]}
                <line
                  class="reference"
                  x1={M.left}
                  x2={M.left + plotWidth}
                  y1={y(p, p.reference)}
                  y2={y(p, p.reference)}
                />
              {/if}
              {#if planStartIndex > 0}
                <line
                  class="plan-start"
                  x1={x(planStartIndex)}
                  x2={x(planStartIndex)}
                  y1={M.top}
                  y2={M.top + plotHeight}
                />
              {/if}

              {#each p.series as s (s.key)}
                {#if s.kind === "line"}
                  <path class="line" d={linePath(p, s.values)} style:stroke={s.color} />
                {:else if s.kind === "dots"}
                  {#each s.values as v, i (i)}
                    {#if v !== null}
                      <circle class="dot" cx={x(i)} cy={y(p, v)} r="2" style:fill={s.color} />
                    {/if}
                  {/each}
                {:else}
                  {@const barWidth = Math.max(1, Math.min(8, step - 2))}
                  {#each s.values as v, i (i)}
                    {#if v !== null}
                      <rect
                        class="bar"
                        x={x(i) - barWidth / 2}
                        y={y(p, v)}
                        width={barWidth}
                        height={Math.max(0, M.top + plotHeight - y(p, v))}
                        style:fill={s.color}
                        rx="1"
                      />
                    {/if}
                  {/each}
                {/if}
              {/each}

              {#if hover}
                <line
                  class="crosshair"
                  x1={hover.left}
                  x2={hover.left}
                  y1={M.top}
                  y2={M.top + plotHeight}
                />
              {/if}
            </svg>
          </div>
        {/each}

        <svg class="x-axis" {width} height="16" aria-hidden="true">
          {#each xLabels as l (l.i)}
            <text class="axis" x={x(l.i)} y="11" text-anchor={l.i === 0 ? "start" : "middle"}
              >{shortDate(l.date)}</text
            >
          {/each}
          {#if planStartIndex > 0}
            <text class="axis plan-label" x={x(planStartIndex) + 3} y="11"
              >{m.recovery.planStarts}</text
            >
          {/if}
        </svg>

        {#if hover}
          <div class="tooltip" class:flip={hover.left > width / 2} style:left="{hover.left}px">
            <div class="tooltip-heading">{shortDate(hover.date)}</div>
            {#each hover.rows as row (row.label)}
              <div class="tooltip-row">
                <span class="swatch" style:background={row.color}></span>
                <span class="tooltip-name">{row.label}</span>
                <span class="tooltip-value">{row.value}</span>
              </div>
            {/each}
          </div>
        {/if}

        <p class="note">{m.recovery.note}</p>
      {:else if panels.length === 0}
        <p class="note">{m.recovery.empty}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .load-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6) var(--space-8);
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 96px;
  }
  .tile-label {
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-muted);
  }
  .tile-value {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
  }
  .tile-value .unit,
  .unit {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-muted);
  }
  .charts {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 960px;
  }
  .panel-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
    margin-bottom: var(--space-1);
    font-size: 14px;
    font-weight: 650;
  }
  .legend {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-muted);
  }
  .swatch {
    display: inline-block;
    width: 12px;
    height: 3px;
    border-radius: 2px;
  }
  .swatch.dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  svg {
    display: block;
    overflow: visible;
    touch-action: pan-y;
  }
  .band {
    fill: var(--sunk);
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .reference {
    stroke: var(--warning);
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
  .plan-start {
    stroke: var(--line-strong);
    stroke-dasharray: 2 3;
  }
  .axis {
    fill: var(--ink-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .plan-label {
    fill: var(--ink-muted);
  }
  .line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .crosshair {
    stroke: var(--line-strong);
    stroke-width: 1;
  }
  .tooltip {
    position: absolute;
    top: 0;
    transform: translateX(12px);
    min-width: 200px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-s);
    background: var(--sheet);
    box-shadow: var(--shadow-float);
    font-size: 12px;
    pointer-events: none;
    z-index: 2;
  }
  .tooltip.flip {
    transform: translateX(calc(-100% - 12px));
  }
  .tooltip-heading {
    font-weight: 650;
    margin-bottom: var(--space-1);
  }
  .tooltip-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tooltip-row .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .tooltip-name {
    flex: 1;
    color: var(--ink-muted);
  }
  .tooltip-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .note {
    max-width: 70ch;
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-muted);
  }
</style>
