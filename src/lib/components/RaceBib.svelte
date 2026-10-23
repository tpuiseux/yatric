<script lang="ts">
  import type { TrainingPlan } from "../../schema/training-plan.js";
  import { getI18n } from "../i18n/index.js";
  import { getTodayISO } from "../utils.js";

  /** The countdown to the race, drawn as a race bib: a band, four pins, the days. */
  interface Props {
    plan: TrainingPlan;
  }

  let { plan }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const today = getTodayISO();
  const raceDate = $derived(plan.meta?.eventDate ?? "");
  const days = $derived(
    raceDate
      ? Math.round((Date.parse(`${raceDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5)
      : 0
  );
  const weeks = $derived(plan.weeks ?? []);
  const current = $derived(weeks.find((w) => w.startDate <= today && today <= w.endDate));
  const total = $derived(plan.meta?.totalWeeks ?? weeks.length);
</script>

<div class="bib">
  <span class="pins" aria-hidden="true"></span>
  <span class="race">{plan.meta?.event}</span>
  {#if days > 0}
    <span class="count">
      <span class="figure-xl">{days}</span>
      <span class="unit">{m.bib.days(days)}</span>
    </span>
  {:else}
    <span class="count"
      ><span class="figure-l">{days === 0 ? m.bib.raceDay : m.bib.done}</span></span
    >
  {/if}
  <span class="foot">
    {fmt.date(raceDate, "full")}
    {#if current}<br />{m.bib.weekOf(current.weekNumber, total)}
    {:else if weeks[0] && today < weeks[0].startDate}<br />{m.bib.startsOn(
        fmt.date(weeks[0].startDate, "dayMonth")
      )}{/if}
  </span>
</div>

<style>
  .bib {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-6) var(--space-6) var(--space-4);
    border-radius: var(--radius-s);
    background: var(--sheet);
    border: 1px solid var(--line);
    border-top: 8px solid var(--signal);
  }
  /* Four safety-pin holes: the bib's one ornament. */
  .bib::before,
  .bib::after,
  .pins::before,
  .pins::after {
    content: "";
    position: absolute;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1.5px solid var(--line-strong);
    background: var(--paper);
  }
  .bib::before {
    top: 8px;
    left: 10px;
  }
  .bib::after {
    top: 8px;
    right: 10px;
  }
  .pins::before {
    bottom: 8px;
    left: 10px;
  }
  .pins::after {
    bottom: 8px;
    right: 10px;
  }
  .race {
    font-size: 13px;
    line-height: 18px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .count {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .unit {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink-muted);
  }
  .foot {
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-muted);
  }
  .foot::first-letter {
    text-transform: uppercase;
  }
</style>
