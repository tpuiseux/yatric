<script lang="ts">
  import { tick } from "svelte";
  import type { TrainingPhase, TrainingWeek } from "../../schema/training-plan.js";
  import { phaseColor } from "../utils.js";

  /** Picks the week on show: arrows, a strip of every week, and a way back to this one. */
  interface Props {
    weeks: TrainingWeek[];
    phases: TrainingPhase[];
    selected: number;
    current: number | null;
    onSelect: (weekNumber: number) => void;
  }

  let { weeks, phases, selected, current, onSelect }: Props = $props();

  const week = $derived(weeks.find((w) => w.weekNumber === selected));
  const first = $derived(weeks[0]?.weekNumber ?? 1);
  const last = $derived(weeks[weeks.length - 1]?.weekNumber ?? 1);

  function phaseOf(weekNumber: number): TrainingPhase | undefined {
    return phases.find((p) => p.startWeek <= weekNumber && weekNumber <= p.endWeek);
  }

  function shortDate(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  }

  const label = $derived.by(() => {
    if (selected === current) return "This week";
    if (current !== null && selected === current + 1) return "Next week";
    if (current !== null && selected === current - 1) return "Last week";
    return `Week ${selected}`;
  });

  // Keep the selected week's pill in view when the strip scrolls (long plans, phones).
  let strip = $state<HTMLElement | null>(null);
  $effect(() => {
    const n = selected;
    tick().then(() => {
      strip
        ?.querySelector<HTMLElement>(`[data-pill="${n}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });
  });
</script>

<nav class="week-nav" aria-label="Weeks">
  <div class="nav-row">
    <button
      class="arrow"
      onclick={() => onSelect(selected - 1)}
      disabled={selected <= first}
      aria-label="Previous week"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>

    <div class="title">
      <div class="label">
        {label}
        <span class="of num">{selected}/{last}</span>
      </div>
      {#if week}
        <div class="sub">
          {shortDate(week.startDate)} – {shortDate(week.endDate)}
          {#if phaseOf(selected)}
            · <span style:color={phaseColor(phaseOf(selected)!.name)}
              >{phaseOf(selected)!.name}</span
            >
          {/if}
        </div>
      {/if}
    </div>

    <button
      class="arrow"
      onclick={() => onSelect(selected + 1)}
      disabled={selected >= last}
      aria-label="Next week"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  </div>

  <div class="strip" bind:this={strip}>
    {#each weeks as w (w.weekNumber)}
      {@const phase = phaseOf(w.weekNumber)}
      <button
        class="pill"
        class:selected={w.weekNumber === selected}
        class:current={w.weekNumber === current}
        class:past={current !== null && w.weekNumber < current}
        style:--c={phaseColor(phase?.name ?? w.phase ?? "")}
        data-pill={w.weekNumber}
        onclick={() => onSelect(w.weekNumber)}
        title="Week {w.weekNumber}{phase ? ` · ${phase.name}` : ''}"
        aria-current={w.weekNumber === selected ? "true" : undefined}
      >
        <span class="num">{w.weekNumber}</span>
      </button>
    {/each}
  </div>

  {#if current !== null && selected !== current}
    <button class="back-today" onclick={() => onSelect(current)}>Back to this week</button>
  {/if}
</nav>

<style>
  .week-nav {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.9rem 1rem 1rem;
    margin-bottom: 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
    backdrop-filter: blur(12px);
  }

  .nav-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .arrow {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--border-medium);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    transition: background var(--transition-fast);
  }

  .arrow svg {
    width: 20px;
    height: 20px;
  }

  .arrow:hover:not(:disabled) {
    background: var(--bg-elevated);
  }

  .arrow:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .title {
    flex: 1;
    min-width: 0;
    text-align: center;
  }

  .label {
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .of {
    margin-left: 0.3rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .sub {
    margin-top: 0.15rem;
    font-size: 0.82rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub span {
    font-weight: 600;
  }

  .strip {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 6px;
  }

  .strip::-webkit-scrollbar {
    display: none;
  }

  .pill {
    position: relative;
    flex: 1 0 2.1rem;
    height: 34px;
    border: none;
    border-top: 3px solid var(--c);
    border-radius: 6px;
    background: color-mix(in srgb, var(--c) 12%, transparent);
    color: var(--text-secondary);
    font-size: 0.8rem;
    font-weight: 600;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .pill.past {
    opacity: 0.6;
  }

  .pill:hover {
    background: color-mix(in srgb, var(--c) 24%, transparent);
    color: var(--text-primary);
  }

  .pill.selected {
    opacity: 1;
    background: var(--c);
    color: var(--bg-primary);
  }

  /* A dot under this week, wherever you've navigated to. */
  .pill.current::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -7px;
    width: 5px;
    height: 5px;
    margin-left: -2.5px;
    border-radius: 50%;
    background: var(--accent);
  }

  .back-today {
    align-self: center;
    margin-top: -0.2rem;
    padding: 0.25rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--accent);
    background: var(--accent-glow);
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 600;
  }

  @media (max-width: 800px) {
    .week-nav {
      top: 56px; /* under the phone's top bar */
      margin: 0 -0.75rem 0.75rem;
      padding: 0.6rem 0.75rem 0.75rem;
      border-radius: 0;
      border-width: 0 0 1px;
      gap: 0.6rem;
    }

    .label {
      font-size: 1.15rem;
    }

    .pill {
      flex-basis: 2.4rem;
      height: 32px;
    }
  }
</style>
