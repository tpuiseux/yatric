<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { base } from "$app/paths";
  import Logo from "$lib/components/Logo.svelte";
  import type { DraftView } from "$lib/planDraft.js";
  import { renderMarkdown } from "$lib/markdown.js";
  import { getI18n } from "$lib/i18n/index.js";
  import { intensityOf } from "$lib/intensity.js";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  let draft = $state<DraftView>(untrack(() => data.draft));
  let feedback = $state("");
  let busy = $state(false);
  let errorText = $state<string | null>(null);

  const url = $derived(`${base}/plans/new/${draft.id}`);
  const working = $derived(draft.status === "assessing" || draft.status === "generating");

  // While the coach works, check on it every few seconds.
  let timer: ReturnType<typeof setTimeout> | null = null;
  async function poll() {
    try {
      const res = await fetch(url);
      if (res.ok) draft = await res.json();
    } catch {
      // Try again next tick.
    }
    schedule();
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = working ? setTimeout(poll, 3000) : null;
  }
  $effect(() => {
    if (working) schedule();
  });
  onDestroy(() => timer && clearTimeout(timer));

  async function act(action: string, text?: string) {
    busy = true;
    errorText = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? m.common.requestFailed(res.status));
      if (action === "adopt") {
        await goto(`${base}/plans/${body.planId}`);
        return;
      }
      draft = body;
      feedback = "";
      schedule();
    } catch (err) {
      errorText = err instanceof Error ? err.message : m.common.somethingWrong;
    } finally {
      busy = false;
    }
  }

  const progress = $derived(
    draft.totalWeeks ? Math.round((draft.weeks.length / draft.totalWeeks) * 100) : 0
  );
</script>

<svelte:head>
  <title>{draft.form.raceName} · {m.builder.newPlan}</title>
</svelte:head>

<header class="bar">
  <a href="{base}/" class="home" aria-label={m.nav.allPlans}><Logo /></a>
  <a class="btn btn-ghost btn-sm" href="{base}/">{m.nav.allPlans}</a>
</header>

<main>
  <div class="heading">
    <h1 class="title-l">{draft.form.raceName}</h1>
    <p class="muted">
      {m.builder.sub(
        fmt.date(draft.form.raceDate, "dayMonth"),
        draft.totalWeeks,
        fmt.date(draft.form.startDate, "dayMonth")
      )}
    </p>
  </div>

  {#if draft.status === "assessing"}
    <div class="working" role="status">
      <span class="spinner" aria-hidden="true"></span>
      {draft.assessment ? m.builder.assessingChanges : m.builder.assessing}
    </div>
  {/if}

  {#if draft.assessment && (draft.status === "awaiting_confirmation" || draft.status === "assessing")}
    <section class:dim={draft.status === "assessing"}>
      <h2 class="title-m">{m.builder.assessment}</h2>
      <div class="markdown message">{@html renderMarkdown(draft.assessment.message)}</div>
      <dl class="outline">
        <div>
          <dt>{m.builder.goal}</dt>
          <dd class="figure-m">{draft.assessment.goalTime}</dd>
        </div>
        {#each draft.assessment.phases as p (p.name + p.startWeek)}
          <div>
            <dt>{m.builder.weekRange(p.startWeek, p.endWeek)}</dt>
            <dd><b>{p.name}</b> <span class="muted">{p.focus}</span></dd>
          </div>
        {/each}
      </dl>
      {#if draft.status === "awaiting_confirmation"}
        <div class="answer">
          <textarea
            class="input"
            bind:value={feedback}
            rows="3"
            aria-label={m.builder.askChanges}
            placeholder={m.builder.changePlaceholder}
          ></textarea>
          <div class="buttons">
            <button class="btn btn-primary" disabled={busy} onclick={() => act("confirm")}>
              {m.builder.confirm}
            </button>
            <button
              class="btn"
              disabled={busy || !feedback.trim()}
              onclick={() => act("feedback", feedback)}
            >
              {m.builder.askChanges}
            </button>
          </div>
        </div>
      {/if}
    </section>
  {/if}

  {#if draft.status === "generating"}
    <section>
      <h2 class="title-m">{m.builder.writing}</h2>
      <div
        class="track"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div style:width="{Math.max(progress, 3)}%"></div>
      </div>
      <p class="muted">
        {m.builder.writingProgress(
          Math.min(draft.weeks.length + 1, draft.totalWeeks),
          draft.totalWeeks
        )}
      </p>
    </section>
  {/if}

  {#if draft.status === "failed"}
    <section>
      <p class="notice error">{draft.error ?? m.common.somethingWrong}</p>
      <div>
        <button class="btn btn-primary" disabled={busy} onclick={() => act("retry")}
          >{m.builder.retry}</button
        >
      </div>
    </section>
  {/if}

  {#if draft.status === "ready"}
    <section>
      <h2 class="title-m">{m.builder.ready}</h2>
      <p>{m.builder.readyText}</p>
      <div>
        <button class="btn btn-primary btn-lg" disabled={busy} onclick={() => act("adopt")}
          >{m.builder.adopt}</button
        >
      </div>
    </section>
  {/if}

  {#if draft.status === "adopted" && draft.planId}
    <section>
      <p>{m.builder.adopted}</p>
      <div><a class="btn btn-primary" href="{base}/plans/{draft.planId}">{m.builder.open}</a></div>
    </section>
  {/if}

  {#if errorText}<p class="notice error" role="alert">{errorText}</p>{/if}

  {#if draft.weeks.length > 0}
    <section class="weeks">
      {#each draft.weeks as week (week.weekNumber)}
        <div class="week">
          <div class="week-head">
            <b>{m.builder.weekShort(week.weekNumber)}</b>
            <span class="muted">{week.phase}</span>
            <span class="muted focus">{week.focus}</span>
            <span class="num">{m.builder.hours(fmt.number(week.summary.totalHours, 1))}</span>
          </div>
          <ul>
            {#each week.days as day (day.date)}
              {#each day.workouts.filter((w) => w.sport !== "rest") as w (w.id)}
                <li>
                  <span class="day">{fmt.date(day.date, "weekday")}</span>
                  <span class="dot {intensityOf(w)}" aria-hidden="true"></span>
                  <span class="name">{w.name}</span>
                  {#if w.durationMinutes}<span class="num muted"
                      >{fmt.duration(w.durationMinutes)}</span
                    >{/if}
                </li>
              {/each}
            {/each}
          </ul>
        </div>
      {/each}
    </section>
  {/if}
</main>

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: 56px;
    padding: 0 max(var(--space-8), calc((100% - 760px) / 2 + var(--space-8)));
    border-bottom: 1px solid var(--line);
  }
  .home {
    display: flex;
    text-decoration: none;
  }
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    max-width: 760px;
    margin-inline: auto;
    padding: var(--space-12) var(--space-8);
  }
  .heading {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-top: var(--space-6);
    border-top: 1px solid var(--line);
  }
  section.dim {
    opacity: 0.55;
  }
  .message {
    max-width: 65ch;
  }
  .outline {
    display: flex;
    flex-direction: column;
  }
  .outline div {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: var(--space-4);
    align-items: baseline;
    padding: var(--space-2) 0;
    border-top: 1px solid var(--line);
  }
  .outline dt {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .answer {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .working {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--ink-muted);
  }
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--line);
    border-top-color: var(--signal);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .track {
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }
  .track div {
    height: 100%;
    background: var(--signal);
    transition: width var(--transition-normal);
  }
  .weeks {
    gap: var(--space-6);
  }
  .week-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
  }
  .focus {
    flex: 1;
    min-width: 0;
    font-size: 13px;
  }
  .week ul {
    list-style: none;
    margin-top: var(--space-2);
  }
  .week li {
    display: grid;
    grid-template-columns: 48px 10px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    padding: 4px 0;
    font-size: 14px;
  }
  .day {
    color: var(--ink-muted);
    font-size: 13px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--z2);
  }
  .dot.z1 {
    background: var(--z1);
  }
  .dot.z3 {
    background: var(--z3);
  }
  .dot.z4 {
    background: var(--z4);
  }
  .dot.z5 {
    background: var(--z5);
  }
  .dot.race {
    background: var(--race);
  }
  .name {
    overflow-wrap: anywhere;
  }

  @media (max-width: 640px) {
    .bar {
      padding: 0 var(--space-4);
    }
    main {
      padding: var(--space-8) var(--space-4);
    }
    .outline div {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
