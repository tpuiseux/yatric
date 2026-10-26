<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { base } from "$app/paths";
  import Logo from "$lib/components/Logo.svelte";
  import { getI18n } from "$lib/i18n/index.js";
  import { RACE_DISTANCES, WEEKDAYS, type PlanForm, type Weekday } from "$lib/planDraft.js";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);

  let form = $state<PlanForm>({
    raceName: "",
    raceDate: "",
    distance: "marathon",
    distanceKm: null,
    terrain: "road",
    elevationGainM: null,
    goalTime: "",
    startDate: untrack(() => data.startDate),
    availableDays: ["tuesday", "thursday", "saturday", "sunday"],
    longRunDay: "sunday",
    runsPerWeek: 4,
    currentWeeklyKm: 30,
    longestRecentRunKm: 12,
    yearsRunning: 2,
    recentRaces: "",
    maxHr: null,
    restingHr: null,
    injuries: "",
    otherSports: "",
    strength: true,
    units: "kilometers",
    language: untrack(() => i18n.locale),
    notes: "",
  });

  let submitting = $state(false);
  let errorText = $state<string | null>(null);

  const weeks = $derived.by(() => {
    if (!form.raceDate || !form.startDate || form.raceDate <= form.startDate) return null;
    const days = (Date.parse(form.raceDate) - Date.parse(form.startDate)) / 86_400_000;
    return Math.floor(days / 7) + 1;
  });

  function toggleDay(day: Weekday) {
    form.availableDays = form.availableDays.includes(day)
      ? form.availableDays.filter((d) => d !== day)
      : WEEKDAYS.filter((d) => d === day || form.availableDays.includes(d));
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    errorText = null;
    try {
      const res = await fetch(`${base}/plans/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? m.builder.couldNotStart);
      await goto(`${base}/plans/new/${body.draftId}`);
    } catch (err) {
      errorText = err instanceof Error ? err.message : m.builder.couldNotStart;
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{m.builder.pageTitle} · Yatric</title>
</svelte:head>

<header class="bar">
  <a href="{base}/" class="home" aria-label={m.nav.allPlans}><Logo /></a>
  <a class="btn btn-ghost btn-sm" href="{base}/">{m.nav.allPlans}</a>
</header>

<main>
  <div class="heading">
    <h1 class="title-l">{m.builder.title}</h1>
    <p>{m.builder.intro}</p>
  </div>

  {#if !data.configured}
    <p class="notice error">{m.builder.notConfigured}</p>
  {/if}

  <form onsubmit={submit}>
    <fieldset>
      <legend class="title-m">{m.builder.race}</legend>
      <label class="field wide">
        {m.builder.raceName}
        <input
          class="input"
          bind:value={form.raceName}
          required
          placeholder={m.builder.raceNamePlaceholder}
        />
      </label>
      <label class="field">
        {m.builder.raceDate}
        <input class="input" type="date" bind:value={form.raceDate} required min={data.today} />
      </label>
      <label class="field">
        {m.builder.distance}
        <select class="input" bind:value={form.distance}>
          {#each Object.keys(RACE_DISTANCES) as key (key)}
            <option value={key}>{m.builder.distances[key]}</option>
          {/each}
          <option value="other">{m.builder.distances.other}</option>
        </select>
      </label>
      {#if form.distance === "other"}
        <label class="field">
          {m.builder.distanceKm}
          <input
            class="input"
            type="number"
            min="1"
            step="0.1"
            bind:value={form.distanceKm}
            required
          />
        </label>
      {/if}
      <label class="field">
        {m.builder.terrain}
        <select class="input" bind:value={form.terrain}>
          <option value="road">{m.builder.road}</option>
          <option value="trail">{m.builder.trail}</option>
        </select>
      </label>
      {#if form.terrain === "trail"}
        <label class="field">
          {m.builder.elevation}
          <input class="input" type="number" min="0" bind:value={form.elevationGainM} />
        </label>
      {/if}
      <label class="field">
        {m.builder.goalTime}
        <input class="input num" bind:value={form.goalTime} placeholder="3:15:00" />
        <span class="field-hint">{m.builder.goalHint}</span>
      </label>
    </fieldset>

    <fieldset>
      <legend class="title-m">{m.builder.week}</legend>
      <label class="field">
        {m.builder.startDate}
        <input class="input" type="date" bind:value={form.startDate} required />
        {#if weeks}<span class="field-hint">{m.builder.weeksToRace(weeks)}</span>{/if}
      </label>
      <div class="field wide">
        <span>{m.builder.days}</span>
        <div class="chips">
          {#each WEEKDAYS as day (day)}
            <button
              type="button"
              class="chip"
              aria-pressed={form.availableDays.includes(day)}
              onclick={() => toggleDay(day)}>{m.builder.dayShort[day]}</button
            >
          {/each}
        </div>
      </div>
      <label class="field">
        {m.builder.longRunDay}
        <select class="input" bind:value={form.longRunDay}>
          {#each WEEKDAYS as day (day)}
            <option value={day}>{m.builder.dayLong[day]}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        {m.builder.runsPerWeek}
        <input class="input" type="number" min="2" max="7" bind:value={form.runsPerWeek} required />
      </label>
      <label class="check wide">
        <input type="checkbox" bind:checked={form.strength} />
        {m.builder.strength}
      </label>
    </fieldset>

    <fieldset>
      <legend class="title-m">{m.builder.running}</legend>
      <label class="field">
        {m.builder.weeklyKm}
        <input class="input" type="number" min="0" bind:value={form.currentWeeklyKm} required />
      </label>
      <label class="field">
        {m.builder.longestRun}
        <input class="input" type="number" min="0" bind:value={form.longestRecentRunKm} required />
      </label>
      <label class="field">
        {m.builder.years}
        <input class="input" type="number" min="0" bind:value={form.yearsRunning} required />
      </label>
      <label class="field">
        {m.builder.maxHr}
        <input class="input" type="number" bind:value={form.maxHr} />
        <span class="field-hint">{m.builder.optional}</span>
      </label>
      <label class="field">
        {m.builder.restingHr}
        <input class="input" type="number" bind:value={form.restingHr} />
        <span class="field-hint">{m.builder.optional}</span>
      </label>
      <label class="field wide">
        {m.builder.recentRaces}
        <textarea
          class="input"
          bind:value={form.recentRaces}
          rows="2"
          placeholder={m.builder.recentRacesPlaceholder}
        ></textarea>
      </label>
      <label class="field wide">
        {m.builder.injuries}
        <textarea
          class="input"
          bind:value={form.injuries}
          rows="2"
          placeholder={m.builder.injuriesPlaceholder}
        ></textarea>
      </label>
      <label class="field wide">
        {m.builder.otherSports}
        <textarea
          class="input"
          bind:value={form.otherSports}
          rows="2"
          placeholder={m.builder.otherSportsPlaceholder}
        ></textarea>
      </label>
      <label class="field wide">
        {m.builder.notes}
        <textarea
          class="input"
          bind:value={form.notes}
          rows="2"
          placeholder={m.builder.notesPlaceholder}
        ></textarea>
      </label>
    </fieldset>

    <fieldset>
      <legend class="title-m">{m.builder.preferences}</legend>
      <label class="field">
        {m.builder.units}
        <select class="input" bind:value={form.units}>
          <option value="kilometers">{m.builder.kilometres}</option>
          <option value="miles">{m.builder.miles}</option>
        </select>
      </label>
      <label class="field">
        {m.builder.planLanguage}
        <select class="input" bind:value={form.language}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
    </fieldset>

    {#if errorText}<p class="notice error" role="alert">{errorText}</p>{/if}
    <div>
      <button
        class="btn btn-primary btn-lg"
        type="submit"
        disabled={submitting || !data.configured}
      >
        {submitting ? m.builder.starting : m.builder.submit}
      </button>
    </div>
  </form>
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
    gap: var(--space-3);
    max-width: 65ch;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }
  fieldset {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
    padding: var(--space-6) 0 0;
    border: 0;
    border-top: 1px solid var(--line);
  }
  legend {
    float: left;
    grid-column: 1 / -1;
    margin-bottom: var(--space-2);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 560;
  }

  @media (max-width: 640px) {
    .bar {
      padding: 0 var(--space-4);
    }
    main {
      padding: var(--space-8) var(--space-4);
    }
    fieldset {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
