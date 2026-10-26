<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { base } from "$app/paths";
  import Logo from "$lib/components/Logo.svelte";
  import { getI18n } from "$lib/i18n/index.js";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const DAY = 86_400_000;
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();

  /** Where the athlete is in a plan: before it, in week n, or past race day. */
  function progress(plan: PageData["plans"][number]) {
    const race = Date.parse(`${plan.event_date}T00:00:00Z`);
    const daysLeft = Math.round((race - today) / DAY);
    const start = plan.start_date ? Date.parse(`${plan.start_date}T00:00:00Z`) : null;
    const weeks = plan.total_weeks ?? 0;
    if (daysLeft < 0) return { label: m.home.done, detail: m.home.behind, ratio: 1, past: true };
    if (start === null || !weeks) {
      return { label: m.home.days(daysLeft), detail: m.home.toRace, ratio: 0, past: false };
    }
    const week = Math.floor((today - start) / (7 * DAY)) + 1;
    if (week < 1) {
      return {
        label: m.home.days(daysLeft),
        detail: `${m.home.toRace}, ${m.home.starts(fmt.date(plan.start_date!, "dayMonth"))}`,
        ratio: 0,
        past: false,
      };
    }
    return {
      label: daysLeft === 0 ? m.countdown.raceDay : m.home.days(daysLeft),
      detail: `${m.home.toRace}, ${m.home.weekOf(Math.min(week, weeks), weeks)}`,
      ratio: Math.min(1, (today - start) / (race - start || 1)),
      past: false,
    };
  }

  let fileInput = $state<HTMLInputElement | null>(null);
  let importing = $state(false);
  let importStatus = $state<{ message: string; isError: boolean } | null>(null);

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    importing = true;
    importStatus = null;
    try {
      const body = new FormData();
      body.append("plan", file);
      const res = await fetch(`${base}/plans`, { method: "POST", body });
      const result = await res.json().catch(() => null);
      if (!res.ok) throw new Error(result?.message ?? m.home.importFailed);
      importStatus = { message: m.home.imported(result.planId), isError: false };
      await invalidateAll();
    } catch (err) {
      importStatus = {
        message: err instanceof Error ? err.message : m.home.importFailed,
        isError: true,
      };
    } finally {
      importing = false;
      input.value = "";
    }
  }
</script>

<svelte:head>
  <title>Yatric</title>
</svelte:head>

<header class="bar">
  <Logo />
  <form method="POST" action="{base}/logout">
    <span class="who">{data.user?.email}</span>
    <button class="btn btn-ghost btn-sm" type="submit">{m.nav.logOut}</button>
  </form>
</header>

<main>
  <div class="head">
    <h1 class="title-l">{m.home.title}</h1>
    <div class="actions">
      <button class="btn" onclick={() => fileInput?.click()} disabled={importing}>
        {importing ? m.home.importing : m.home.import}
      </button>
      <a class="btn btn-primary" href="{base}/plans/new">{m.home.create}</a>
      <input
        type="file"
        accept=".json,application/json"
        bind:this={fileInput}
        onchange={handleFileSelect}
        hidden
      />
    </div>
  </div>

  {#if importStatus}
    <p class="notice" class:error={importStatus.isError} role="status">{importStatus.message}</p>
  {/if}

  {#if data.plans.length === 0}
    <div class="empty">
      <h2 class="title-m">{m.home.emptyTitle}</h2>
      <p>{m.home.emptyText}</p>
      <div><a class="btn btn-primary btn-lg" href="{base}/plans/new">{m.home.emptyCta}</a></div>
      <p class="small muted">{m.home.emptyHint}</p>
    </div>
  {:else}
    <ul>
      {#each data.plans as plan (plan.id)}
        {@const p = progress(plan)}
        <li>
          <a href="{base}/plans/{plan.id}" class:past={p.past}>
            <span class="race">
              <span class="title-s">{plan.event}</span>
              <span class="small muted first-cap">{fmt.date(plan.event_date, "full")}</span>
            </span>
            <span class="countdown">
              <span class="figure-m">{p.label}</span>
              <span class="small muted">{p.detail}</span>
            </span>
            <span class="track" aria-hidden="true"
              ><span style:width="{p.ratio * 100}%"></span></span
            >
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: 56px;
    padding: 0 max(var(--space-8), calc((100% - 880px) / 2 + var(--space-8)));
    border-bottom: 1px solid var(--line);
  }
  .bar form {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .who {
    font-size: 13px;
    color: var(--ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    max-width: 880px;
    margin-inline: auto;
    padding: var(--space-12) var(--space-8);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
  }
  ul {
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  li a {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--space-4);
    padding: var(--space-6) 0 var(--space-6);
    border-top: 1px solid var(--line);
    color: var(--ink);
    text-decoration: none;
  }
  li:last-child a {
    border-bottom: 1px solid var(--line);
  }
  li a:hover .title-s {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .past {
    opacity: 0.6;
  }
  .race,
  .countdown {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .countdown {
    align-items: flex-end;
    text-align: right;
  }
  .first-cap::first-letter {
    text-transform: uppercase;
  }
  .track {
    grid-column: 1 / -1;
    height: 3px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .track span {
    display: block;
    height: 100%;
    background: var(--signal);
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 60ch;
    padding-top: var(--space-6);
    border-top: 1px solid var(--line);
  }

  @media (max-width: 640px) {
    .bar {
      padding: 0 var(--space-4);
    }
    main {
      padding: var(--space-8) var(--space-4);
    }
    li a {
      grid-template-columns: minmax(0, 1fr);
    }
    .countdown {
      align-items: flex-start;
      text-align: left;
    }
  }
</style>
