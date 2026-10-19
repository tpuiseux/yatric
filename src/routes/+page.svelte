<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { base } from "$app/paths";
  import Logo from "$lib/components/Logo.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const DAY = 86_400_000;
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();

  function formatDate(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  /** Where the athlete is in a plan: before it, in week n, or past race day. */
  function progress(plan: PageData["plans"][number]) {
    const race = Date.parse(`${plan.event_date}T00:00:00Z`);
    const daysLeft = Math.round((race - today) / DAY);
    const start = plan.start_date ? Date.parse(`${plan.start_date}T00:00:00Z`) : null;
    const weeks = plan.total_weeks ?? 0;
    if (daysLeft < 0)
      return { label: "Done", detail: "Race day is behind you", ratio: 1, past: true };
    if (start === null || !weeks) {
      return { label: `${daysLeft} days`, detail: "to race day", ratio: 0, past: false };
    }
    const week = Math.floor((today - start) / (7 * DAY)) + 1;
    if (week < 1) {
      return {
        label: `${daysLeft} days`,
        detail: `to race day · starts ${formatDate(plan.start_date!)}`,
        ratio: 0,
        past: false,
      };
    }
    return {
      label: daysLeft === 0 ? "Race day" : `${daysLeft} days`,
      detail: `to race day · week ${Math.min(week, weeks)} of ${weeks}`,
      ratio: Math.min(1, (today - start) / (race - start || 1)),
      past: false,
    };
  }

  let fileInput = $state<HTMLInputElement | null>(null);
  let importing = $state(false);
  let importStatus = $state<{ message: string; isError: boolean } | null>(null);

  function handleImportClick() {
    fileInput?.click();
  }

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
      if (!res.ok) {
        throw new Error(result?.message ?? `Import failed (${res.status})`);
      }
      importStatus = { message: `Imported ${result.planId}.`, isError: false };
      await invalidateAll();
    } catch (err) {
      importStatus = {
        message: err instanceof Error ? err.message : "Import failed.",
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

<div class="page">
  <nav>
    <Logo size={28} />
    <form method="POST" action="{base}/logout">
      <span class="who">{data.user?.email}</span>
      <button class="btn btn-ghost" type="submit">Log out</button>
    </form>
  </nav>

  <main>
    <header>
      <h1>Your plans</h1>
      <div class="header-actions">
        <button class="btn" onclick={handleImportClick} disabled={importing}>
          {importing ? "Importing…" : "Import plan"}
        </button>
        <a class="btn btn-primary" href="{base}/plans/new">Create a plan</a>
        <input
          type="file"
          accept=".json,application/json"
          bind:this={fileInput}
          onchange={handleFileSelect}
          style="display: none"
        />
      </div>
    </header>

    {#if importStatus}
      <p class="notice" class:error={importStatus.isError}>{importStatus.message}</p>
    {/if}

    {#if data.plans.length === 0}
      <div class="empty">
        <h2>Your first plan starts here</h2>
        <p>
          Tell the coach about your race and your running. It assesses where you stand, agrees a
          goal with you, then writes your plan week by week.
        </p>
        <a class="btn btn-primary btn-lg" href="{base}/plans/new">Create my plan with the coach</a>
        <p class="hint">Or import a plan you already have as a JSON file.</p>
      </div>
    {:else}
      <ul>
        {#each data.plans as plan (plan.id)}
          {@const p = progress(plan)}
          <li>
            <a href="{base}/plans/{plan.id}" class:past={p.past}>
              <div class="plan-main">
                <strong>{plan.event}</strong>
                <span class="date">{formatDate(plan.event_date)}</span>
              </div>
              <div class="plan-side">
                <span class="countdown num">{p.label}</span>
                <span class="detail">{p.detail}</span>
              </div>
              <div class="bar" aria-hidden="true">
                <span style:width="{p.ratio * 100}%"></span>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </main>
</div>

<style>
  .page {
    min-height: 100vh;
    background:
      radial-gradient(70rem 26rem at 50% -14rem, var(--accent-glow), transparent 70%),
      var(--bg-primary);
  }

  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 760px;
    margin: 0 auto;
    padding: 1.25rem 1.5rem;
  }

  nav form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .who {
    color: var(--text-muted);
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  h1 {
    font-size: 1.9rem;
    font-weight: 650;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .notice {
    margin-bottom: 1.25rem;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    padding: 2.25rem 2rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--bg-secondary);
  }

  .empty h2 {
    font-size: 1.35rem;
    font-weight: 650;
  }

  .empty p {
    max-width: 34rem;
    color: var(--text-secondary);
  }

  .empty .hint {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  li a {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.25rem 1.5rem;
    padding: 1.25rem 1.4rem 1.5rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    color: var(--text-primary);
    text-decoration: none;
    overflow: hidden;
    transition:
      border-color var(--transition-fast),
      transform var(--transition-fast);
  }

  li a:hover {
    border-color: var(--border-medium);
    transform: translateY(-1px);
  }

  li a.past {
    opacity: 0.65;
  }

  .plan-main,
  .plan-side {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .plan-side {
    align-items: flex-end;
    text-align: right;
  }

  strong {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .date,
  .detail {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .countdown {
    font-size: 1.35rem;
    font-weight: 650;
    color: var(--accent);
  }

  .past .countdown {
    color: var(--text-secondary);
  }

  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--bg-tertiary);
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  @media (max-width: 600px) {
    nav {
      padding: 1rem;
    }

    .who {
      display: none;
    }

    main {
      padding: 1rem 1rem 3rem;
    }

    header {
      flex-direction: column;
      align-items: stretch;
    }

    h1 {
      font-size: 1.6rem;
    }

    .header-actions > * {
      flex: 1;
      min-height: 44px;
    }

    .empty {
      padding: 1.5rem 1.25rem;
    }

    li a {
      grid-template-columns: 1fr;
    }

    .plan-side {
      flex-direction: row;
      align-items: baseline;
      gap: 0.4rem;
      text-align: left;
    }
  }
</style>
