<script lang="ts">
  import { fatigueSignals, type FatigueSignal, type LoadDay } from "../load.js";
  import { getI18n } from "../i18n/index.js";

  /**
   * This morning's recovery in one word and one line: good, watch it or
   * rest advised, and the main reason. The detail lives in the Recovery
   * view; the coach is a click away.
   */
  interface Props {
    days: LoadDay[];
    onDetails: () => void;
    onAskCoach: (text: string) => void;
  }

  let { days, onDetails, onAskCoach }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const signals = $derived(
    fatigueSignals(days).sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1))
  );
  // A reading this morning or yesterday, else there's nothing to say.
  const hasData = $derived(
    days.slice(-2).some((d) => d.hrv !== null || d.restingHr !== null || d.readiness !== null)
  );
  const level = $derived(
    signals.some((s) => s.level === "red")
      ? "red"
      : signals.length
        ? "warn"
        : hasData
          ? "ok"
          : "none"
  );

  function title(s: FatigueSignal): string {
    switch (s.code) {
      case "acwr":
        return m.signals.acwr(fmt.number(s.n, 2)).title;
      case "hrvStress":
        return m.signals.hrvStress().title;
      default:
        return (m.signals[s.code] as (n: number) => { title: string })(s.n).title;
    }
  }

  function ask() {
    onAskCoach(m.signals.coachMessage(signals.map((s) => title(s).toLowerCase()).join("; ")));
  }
</script>

<div class="status">
  <span class="small muted">{m.signals.morning}</span>
  <span class="word {level}"
    ><span class="dot" aria-hidden="true"></span>{m.signals.status[level]}</span
  >
  {#if signals.length}
    <span class="reason">
      {title(signals[0])}{#if signals.length > 1}<span class="muted"
          >, {m.signals.andMore(signals.length - 1)}</span
        >{/if}
    </span>
  {:else if level === "ok"}
    <span class="reason muted">{m.signals.allClear}</span>
  {/if}
  {#if level !== "none"}
    <span class="links">
      <button class="link" onclick={onDetails}>{m.signals.details}</button>
      {#if signals.length}
        <button class="link" onclick={ask}>{m.signals.askCoach}</button>
      {/if}
    </span>
  {/if}
</div>

<style>
  .status {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .word {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 20px;
    line-height: 26px;
    font-weight: 680;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--line-strong);
    flex-shrink: 0;
  }
  .ok .dot {
    background: var(--success);
  }
  .warn .dot {
    background: var(--z3);
  }
  .warn {
    color: var(--warning);
  }
  .red .dot {
    background: var(--danger);
  }
  .red {
    color: var(--danger);
  }
  .none {
    color: var(--ink-muted);
  }
  .reason {
    font-size: 13px;
    line-height: 18px;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    margin-top: var(--space-1);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--signal);
  }
  .link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
