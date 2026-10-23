<script lang="ts">
  import { base } from "$app/paths";
  import type { TrainingPlan } from "../../schema/training-plan.js";
  import { getI18n } from "../i18n/index.js";
  import { getTodayISO } from "../utils.js";
  import Logo from "./Logo.svelte";

  export type PlanView = "week" | "plan" | "recovery";

  /**
   * The top of a plan: the brand, the race and where the athlete stands, the
   * plan's sections and the coach. On a phone the sections move to a tab bar
   * at the bottom, with the coach as a fourth tab.
   */
  interface Props {
    plan: TrainingPlan;
    view: PlanView;
    onView: (view: PlanView) => void;
    coachOpen: boolean;
    onToggleCoach: () => void;
    onSettings: () => void;
  }

  let { plan, view, onView, coachOpen, onToggleCoach, onSettings }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const today = getTodayISO();
  const weeks = $derived(plan.weeks ?? []);
  const total = $derived(plan.meta?.totalWeeks ?? weeks.length);
  const days = $derived(
    Math.round(
      (Date.parse(`${plan.meta?.eventDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5
    )
  );
  const current = $derived(weeks.find((w) => w.startDate <= today && today <= w.endDate));

  const countdown = $derived(
    days > 0 ? m.countdown.short(days) : days === 0 ? m.countdown.raceDay : m.countdown.done
  );
  const where = $derived(
    current
      ? m.countdown.weekOf(current.weekNumber, total)
      : weeks[0] && today < weeks[0].startDate
        ? m.countdown.startsOn(fmt.date(weeks[0].startDate, "dayMonth"))
        : ""
  );

  const tabs = $derived<{ id: PlanView; label: string }[]>([
    { id: "week", label: m.nav.week },
    { id: "plan", label: m.nav.plan },
    { id: "recovery", label: m.nav.recovery },
  ]);
</script>

<header class="bar">
  <a class="home" href="{base}/" aria-label={m.nav.allPlans}><Logo /></a>
  <div class="race">
    <b>{plan.meta?.event}</b>
    <span>{countdown}{where ? `, ${where}` : ""}</span>
  </div>
  <nav class="tabs" aria-label={m.nav.sections}>
    {#each tabs as t (t.id)}
      <button
        class="tab"
        aria-current={view === t.id ? "page" : undefined}
        onclick={() => onView(t.id)}>{t.label}</button
      >
    {/each}
  </nav>
  <div class="actions">
    <button class="btn" class:on={coachOpen} aria-pressed={coachOpen} onclick={onToggleCoach}>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg
      >
      {m.nav.coach}
    </button>
    <button class="btn btn-ghost btn-icon" aria-label={m.nav.settings} onclick={onSettings}>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><circle cx="12" cy="12" r="3" /><path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        /></svg
      >
    </button>
  </div>
</header>

<nav class="bottom" aria-label={m.nav.sections}>
  {#each tabs as t (t.id)}
    <button
      class="tab"
      aria-current={view === t.id && !coachOpen ? "page" : undefined}
      onclick={() => {
        if (coachOpen) onToggleCoach();
        onView(t.id);
      }}>{t.label}</button
    >
  {/each}
  <button class="tab" aria-current={coachOpen ? "page" : undefined} onclick={onToggleCoach}
    >{m.nav.coach}</button
  >
</nav>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: var(--space-6);
    min-height: 56px;
    padding: 0 var(--space-8);
    border-bottom: 1px solid var(--line);
    background: var(--paper);
  }
  .home {
    display: flex;
    text-decoration: none;
  }
  .race {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .race b {
    font-size: 14px;
    line-height: 18px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .race span {
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
  }
  .tabs {
    display: flex;
    gap: var(--space-1);
    margin-left: auto;
    align-self: stretch;
  }
  .tab {
    padding: 0 var(--space-3);
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--ink-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }
  .tab:hover {
    color: var(--ink);
  }
  .tab[aria-current="page"] {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .actions svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .btn.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .bottom {
    display: none;
  }

  @media (max-width: 800px) {
    .bar {
      gap: var(--space-3);
      padding: 0 var(--space-4);
    }
    .tabs,
    .actions .btn:not(.btn-icon) {
      display: none;
    }
    .actions {
      margin-left: auto;
    }
    .bottom {
      position: fixed;
      inset: auto 0 0;
      z-index: 40;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      border-top: 1px solid var(--line);
      background: var(--sheet);
    }
    .bottom .tab {
      height: 56px;
      padding: 0 var(--space-1);
      border-bottom: 0;
      border-top: 2px solid transparent;
      font-size: 13px;
    }
    .bottom .tab[aria-current="page"] {
      border-top-color: var(--ink);
    }
  }
</style>
