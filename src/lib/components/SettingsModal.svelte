<script lang="ts">
  import { untrack } from "svelte";
  import { base } from "$app/paths";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import {
    type Settings,
    recalculateHrZones,
    recalculatePowerZones,
    rescaleRunPaceZones,
    recalculateSwimPaceZones,
  } from "../settings.js";
  import GarminConnect from "./GarminConnect.svelte";
  import { getI18n, LOCALES, LOCALE_NAMES, type Locale } from "../i18n/index.js";
  import { THEMES, type Theme } from "../preferences.js";

  const version = __APP_VERSION__;

  interface Props {
    settings: Settings;
    onClose: () => void;
    onChange: (settings: Settings) => void;
    onExportPlan: () => void;
    onGarminSynced: () => void;
  }

  let { settings, onClose, onChange, onExportPlan, onGarminSynced }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);

  let activeTab = $state("general");
  // Use untrack to explicitly capture initial value (intentional local copy)
  let localSettings = $state(untrack(() => JSON.parse(JSON.stringify(settings))));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains("overlay")) {
      onClose();
    }
  }

  function save() {
    onChange(localSettings);
  }

  // Language and theme belong to this browser, not the plan (routes/preferences).
  let theme = $state<Theme>(untrack(() => (page.data.theme as Theme) ?? "dark"));

  async function savePreference(body: { lang?: Locale; theme?: Theme }) {
    await fetch(`${base}/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function setTheme(value: Theme) {
    theme = value;
    document.documentElement.setAttribute("data-theme", value);
    savePreference({ theme: value });
  }

  async function setLanguage(value: Locale) {
    await savePreference({ lang: value });
    document.documentElement.lang = value;
    await invalidateAll();
  }

  function recalcHr(sport: "run" | "bike") {
    localSettings[sport].hrZones = recalculateHrZones(localSettings[sport].lthr);
    save();
  }

  function recalcPower() {
    localSettings.bike.powerZones = recalculatePowerZones(localSettings.bike.ftp);
    save();
  }

  function recalcRunPace() {
    localSettings.run.paceZones = rescaleRunPaceZones(
      localSettings.run.paceZones,
      localSettings.run.thresholdPace
    );
    save();
  }

  function recalcSwimPace() {
    localSettings.swim.paceZones = recalculateSwimPaceZones(localSettings.swim.css);
    save();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet zoneHelp(title: string, steps: string[], notes: string[])}
  <details class="help">
    <summary>{title}</summary>
    {#if steps.length}
      <ol>
        {#each steps as step (step)}<li>{step}</li>{/each}
      </ol>
    {/if}
    {#each notes as note (note)}<p>{note}</p>{/each}
  </details>
{/snippet}

<div
  class="overlay"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="settings-title"
  tabindex="-1"
>
  <div class="sheet">
    <header>
      <h2 class="title-m" id="settings-title">{m.settings.title}</h2>
      <button class="btn btn-ghost btn-icon btn-sm" onclick={onClose} aria-label={m.common.close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </header>

    <nav class="tabs" aria-label={m.settings.title}>
      {#each ["general", "run", "bike", "swim", "garmin", "data", "about"] as id (id)}
        <button
          class="tab"
          aria-current={activeTab === id ? "page" : undefined}
          onclick={() => (activeTab = id)}
        >
          {m.settings.tabs[id]}
        </button>
      {/each}
    </nav>

    <div class="body">
      {#if activeTab === "general"}
        <section>
          <h3 class="title-s">{m.settings.language}</h3>
          <div class="chips" role="group" aria-label={m.settings.language}>
            {#each LOCALES as l (l)}
              <button class="chip" aria-pressed={i18n.locale === l} onclick={() => setLanguage(l)}>
                {LOCALE_NAMES[l]}
              </button>
            {/each}
          </div>
          <p class="small muted">{m.settings.languageHint}</p>
        </section>

        <section>
          <h3 class="title-s">{m.settings.theme}</h3>
          <div class="chips" role="group" aria-label={m.settings.theme}>
            {#each THEMES as t (t)}
              <button class="chip" aria-pressed={theme === t} onclick={() => setTheme(t)}>
                {m.settings.themes[t]}
              </button>
            {/each}
          </div>
        </section>

        <section>
          <h3 class="title-s">{m.settings.units}</h3>
          <div class="grid3">
            <label class="field">
              {m.settings.swim}
              <select class="input" bind:value={localSettings.units.swim} onchange={save}>
                <option value="meters">{m.settings.meters}</option>
                <option value="yards">{m.settings.yards}</option>
              </select>
            </label>
            <label class="field">
              {m.settings.bike}
              <select class="input" bind:value={localSettings.units.bike} onchange={save}>
                <option value="kilometers">{m.settings.kilometers}</option>
                <option value="miles">{m.settings.miles}</option>
              </select>
            </label>
            <label class="field">
              {m.settings.run}
              <select class="input" bind:value={localSettings.units.run} onchange={save}>
                <option value="kilometers">{m.settings.kilometers}</option>
                <option value="miles">{m.settings.miles}</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h3 class="title-s">{m.settings.calendar}</h3>
          <label class="field narrow">
            {m.settings.firstDay}
            <select class="input" bind:value={localSettings.firstDayOfWeek} onchange={save}>
              <option value="monday">{m.settings.monday}</option>
              <option value="sunday">{m.settings.sunday}</option>
            </select>
          </label>
        </section>
      {/if}

      {#if activeTab === "run" || activeTab === "bike"}
        {@const sport = activeTab as "run" | "bike"}
        <section>
          <h3 class="title-s">{m.settings.hrZones}</h3>
          <div class="threshold">
            <label class="field">
              {sport === "run" ? m.settings.runLthr : m.settings.bikeLthr}
              <input
                type="number"
                class="input num"
                bind:value={localSettings[sport].lthr}
                min="100"
                max="220"
              />
            </label>
            <button class="btn" onclick={() => recalcHr(sport)}>{m.settings.recalculate}</button>
          </div>
          <table class="zones">
            <thead>
              <tr
                ><th>{m.settings.zone}</th><th>{m.settings.name}</th><th>{m.settings.low}</th><th
                  >{m.settings.high}</th
                ></tr
              >
            </thead>
            <tbody>
              {#each localSettings[sport].hrZones as zone, i (i)}
                <tr>
                  <td><span class="zbadge z{String(zone.zone).charAt(0)}">Z{zone.zone}</span></td>
                  <td>{zone.name}</td>
                  <td
                    ><input
                      type="number"
                      class="input num"
                      aria-label="{zone.name}, {m.settings.low}"
                      bind:value={localSettings[sport].hrZones[i].low}
                      onchange={save}
                    /></td
                  >
                  <td
                    ><input
                      type="number"
                      class="input num"
                      aria-label="{zone.name}, {m.settings.high}"
                      bind:value={localSettings[sport].hrZones[i].high}
                      onchange={save}
                    /></td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
          {@render zoneHelp(
            m.settings.howLthr,
            m.settings.lthrSteps,
            sport === "bike" ? [m.settings.lthrBikeNote] : []
          )}
        </section>

        {#if sport === "run"}
          <section>
            <h3 class="title-s">{m.settings.paceZones}</h3>
            <div class="threshold">
              <label class="field">
                {m.settings.thresholdPace}
                <input
                  type="text"
                  class="input num"
                  bind:value={localSettings.run.thresholdPace}
                  placeholder="4:30"
                />
              </label>
              <button class="btn" onclick={recalcRunPace}>{m.settings.recalculate}</button>
            </div>
            <table class="zones">
              <thead
                ><tr
                  ><th>{m.settings.zone}</th><th>{m.settings.name}</th><th
                    >{m.settings.pacePerKm}</th
                  ></tr
                ></thead
              >
              <tbody>
                {#each localSettings.run.paceZones as zone, i (i)}
                  <tr>
                    <td><span class="zbadge z{Math.min(5, i + 1)}">{zone.zone}</span></td>
                    <td>{zone.name}</td>
                    <td
                      ><input
                        type="text"
                        class="input num"
                        aria-label="{zone.name}, {m.settings.pacePerKm}"
                        bind:value={localSettings.run.paceZones[i].pace}
                        onchange={save}
                      /></td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
            {@render zoneHelp(
              m.settings.howThreshold,
              [],
              [m.settings.thresholdRace, m.settings.thresholdTest]
            )}
          </section>
        {:else}
          <section>
            <h3 class="title-s">{m.settings.powerZones}</h3>
            <div class="threshold">
              <label class="field">
                {m.settings.ftp}
                <input
                  type="number"
                  class="input num"
                  bind:value={localSettings.bike.ftp}
                  min="50"
                  max="500"
                />
              </label>
              <button class="btn" onclick={recalcPower}>{m.settings.recalculate}</button>
            </div>
            <table class="zones">
              <thead
                ><tr
                  ><th>{m.settings.zone}</th><th>{m.settings.name}</th><th>{m.settings.lowW}</th><th
                    >{m.settings.highW}</th
                  ></tr
                ></thead
              >
              <tbody>
                {#each localSettings.bike.powerZones as zone, i (i)}
                  <tr>
                    <td
                      ><span class="zbadge z{Math.min(5, Number(zone.zone) || 1)}"
                        >Z{zone.zone}</span
                      ></td
                    >
                    <td>{zone.name}</td>
                    <td
                      ><input
                        type="number"
                        class="input num"
                        aria-label="{zone.name}, {m.settings.lowW}"
                        bind:value={localSettings.bike.powerZones[i].low}
                        onchange={save}
                      /></td
                    >
                    <td
                      ><input
                        type="number"
                        class="input num"
                        aria-label="{zone.name}, {m.settings.highW}"
                        bind:value={localSettings.bike.powerZones[i].high}
                        onchange={save}
                      /></td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
            {@render zoneHelp(m.settings.howFtp, m.settings.ftpSteps, [m.settings.ftpRamp])}
          </section>
        {/if}
      {/if}

      {#if activeTab === "swim"}
        <section>
          <h3 class="title-s">{m.settings.paceZones}</h3>
          <div class="threshold">
            <label class="field">
              {m.settings.css}
              <input
                type="text"
                class="input num"
                bind:value={localSettings.swim.css}
                placeholder="1:45"
              />
            </label>
            <button class="btn" onclick={recalcSwimPace}>{m.settings.recalculate}</button>
          </div>
          <table class="zones">
            <thead
              ><tr
                ><th>{m.settings.zone}</th><th>{m.settings.name}</th><th>{m.settings.offset}</th><th
                  >{m.settings.pacePer100}</th
                ></tr
              ></thead
            >
            <tbody>
              {#each localSettings.swim.paceZones as zone, i (i)}
                <tr>
                  <td
                    ><span class="zbadge z{Math.min(5, Number(zone.zone) || 1)}">Z{zone.zone}</span
                    ></td
                  >
                  <td>{zone.name}</td>
                  <td class="num">{(zone.offset ?? 0) >= 0 ? "+" : ""}{zone.offset} s</td>
                  <td
                    ><input
                      type="text"
                      class="input num"
                      aria-label="{zone.name}, {m.settings.pacePer100}"
                      bind:value={localSettings.swim.paceZones[i].pace}
                      onchange={save}
                    /></td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
          {@render zoneHelp(m.settings.howCss, m.settings.cssSteps, [m.settings.cssExample])}
        </section>
      {/if}

      {#if activeTab === "garmin"}
        <section>
          <p class="intro">{m.settings.garminIntro}</p>

          <GarminConnect onSynced={onGarminSynced} />
        </section>
      {/if}

      {#if activeTab === "data"}
        <section>
          <h3 class="title-s">{m.settings.dataTitle}</h3>
          <p class="intro">{m.settings.dataIntro}</p>
          <div class="action">
            <div>
              <b>{m.settings.exportTitle}</b>
              <span class="small muted">{m.settings.exportHint}</span>
            </div>
            <button class="btn" onclick={onExportPlan}>{m.settings.exportButton}</button>
          </div>
        </section>
      {/if}

      {#if activeTab === "about"}
        <section>
          <span class="y-wordmark" style:font-size="32px">yatric</span>
          <p class="small muted">{m.settings.version(version)}</p>
          <p class="intro">{m.settings.about}</p>
          <p class="small muted">{m.settings.license}</p>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background: rgba(15, 17, 21, 0.32);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    width: min(680px, 100%);
    max-height: min(820px, 100%);
    border-radius: var(--radius-m);
    background: var(--sheet);
    box-shadow: var(--shadow-float);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-6) var(--space-8) var(--space-2);
  }
  header svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }
  /* Header and tabs keep their height; only the body scrolls. */
  header,
  .tabs {
    flex-shrink: 0;
  }
  .tabs {
    display: flex;
    gap: var(--space-1);
    padding: 0 var(--space-6);
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
  }
  .tab {
    height: 44px;
    padding: 0 var(--space-2);
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--ink-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }
  .tab[aria-current="page"] {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-6) var(--space-8) var(--space-8);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .intro {
    max-width: 65ch;
  }
  .grid2,
  .grid3 {
    display: grid;
    gap: var(--space-3);
  }
  .grid2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .grid3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .narrow {
    max-width: 280px;
  }
  .threshold {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
  .threshold .field {
    width: 160px;
  }
  .zones {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .zones th {
    padding: var(--space-1) var(--space-2);
    text-align: left;
    font-size: 12px;
    font-weight: 560;
    color: var(--ink-muted);
  }
  .zones td {
    padding: var(--space-1) var(--space-2);
    border-top: 1px solid var(--line);
  }
  .zones .input {
    height: 32px;
    width: 96px;
  }
  .zbadge {
    display: inline-block;
    min-width: 32px;
    padding: 2px 6px;
    border-radius: var(--radius-s);
    background: var(--z2);
    color: var(--on-z2);
    text-align: center;
    font-size: 12px;
    font-weight: 650;
  }
  .zbadge.z1 {
    background: var(--z1);
    color: var(--on-z1);
  }
  .zbadge.z3 {
    background: var(--z3);
    color: var(--on-z3);
  }
  .zbadge.z4 {
    background: var(--z4);
    color: var(--on-z4);
  }
  .zbadge.z5 {
    background: var(--z5);
    color: var(--on-z5);
  }
  .help {
    font-size: 14px;
  }
  .help summary {
    cursor: pointer;
    font-weight: 600;
  }
  .help ol {
    margin: var(--space-2) 0;
    padding-left: 1.25rem;
  }
  .help p {
    margin-top: var(--space-2);
    max-width: 65ch;
    color: var(--ink-muted);
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--line);
  }
  .action > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .error {
    color: var(--danger);
  }

  @media (max-width: 640px) {
    .overlay {
      padding: 0;
    }
    .sheet {
      width: 100%;
      height: 100%;
      max-height: none;
      border-radius: 0;
    }
    header,
    .body {
      padding-left: var(--space-4);
      padding-right: var(--space-4);
    }
    .tabs {
      padding: 0 var(--space-2);
    }
    .grid2,
    .grid3 {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
