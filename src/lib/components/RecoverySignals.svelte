<script lang="ts">
  import { fatigueSignals, type FatigueSignal, type LoadDay } from "../load.js";
  import { getI18n } from "../i18n/index.js";

  /**
   * What this morning's recovery data says, and what to do about it: the
   * worst first, three at most, with a way to ask the coach.
   */
  interface Props {
    days: LoadDay[];
    onAskCoach: (text: string) => void;
  }

  let { days, onAskCoach }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const signals = $derived(
    fatigueSignals(days)
      .sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1))
      .slice(0, 3)
  );

  function words(s: FatigueSignal): { title: string; advice: string } {
    switch (s.code) {
      case "acwr":
        return m.signals.acwr(fmt.number(s.n, 2));
      case "hrvStress":
        return m.signals.hrvStress();
      default:
        return (m.signals[s.code] as (n: number) => { title: string; advice: string })(s.n);
    }
  }

  function ask() {
    onAskCoach(m.signals.coachMessage(signals.map((s) => words(s).title.toLowerCase()).join("; ")));
  }
</script>

{#if signals.length > 0}
  <div class="signals" role="status">
    {#each signals as s, i (s.key)}
      {@const w = words(s)}
      <div class="signal" class:red={s.level === "red"}>
        <span class="signal-icon">
          {#if s.level === "red"}
            <svg viewBox="0 0 24 24" aria-hidden="true"
              ><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg
            >
          {:else}
            <svg viewBox="0 0 24 24" aria-hidden="true"
              ><path
                d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
              /><path d="M12 9v4M12 17h.01" /></svg
            >
          {/if}
        </span>
        <div>
          <div class="signal-title">{w.title}</div>
          <div>{w.advice}</div>
        </div>
        {#if i === signals.length - 1}
          <button class="btn btn-sm" onclick={ask}>{m.signals.askCoach}</button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .signals {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
