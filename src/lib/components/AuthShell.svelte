<script lang="ts">
  import type { Snippet } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { base } from "$app/paths";
  import { getI18n, LOCALES, LOCALE_NAMES, type Locale } from "../i18n/index.js";
  import Logo from "./Logo.svelte";

  /**
   * The frame around the login and sign-up forms: the form on the left,
   * the bib on the right (the brand's one bold picture), and the language.
   */
  interface Props {
    /** Without one, the wordmark stands alone with what the name means. */
    title?: string;
    subtitle?: string;
    children: Snippet;
  }

  let { title, subtitle, children }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);

  async function setLanguage(lang: Locale) {
    await fetch(`${base}/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    document.documentElement.lang = lang;
    await invalidateAll();
  }
</script>

<div class="shell">
  <main>
    <!-- Without a title, the brand is the page's heading. -->
    <svelte:element this={title ? "div" : "h1"} class="brand">
      <Logo size={32} />
      <span class="muted">Yet Another Triathlon Coach</span>
    </svelte:element>
    {#if title}
      <div class="heading">
        <h1 class="title-l">{title}</h1>
        {#if subtitle}<p class="muted">{subtitle}</p>{/if}
      </div>
    {/if}
    {@render children()}
    <div class="chips lang" role="group" aria-label="Language">
      {#each LOCALES as l (l)}
        <button class="chip" aria-pressed={i18n.locale === l} onclick={() => setLanguage(l)}>
          {LOCALE_NAMES[l]}
        </button>
      {/each}
    </div>
  </main>

  <div class="bib" aria-hidden="true">
    <span class="pin tl"></span><span class="pin tr"></span><span class="pin bl"></span><span
      class="pin br"
    ></span>
    <span class="number">42</span>
    <span class="tagline">{m.auth.tagline}</span>
  </div>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-height: 100vh;
    background: var(--paper);
  }
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-6);
  }
  .brand {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: 15px;
    line-height: 22px;
    font-weight: 500;
    letter-spacing: 0;
  }
  .heading {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  main :global(form) {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  main :global(form .btn-primary) {
    margin-top: var(--space-2);
  }
  main :global(.switch) {
    font-size: 14px;
    color: var(--ink-muted);
  }
  .lang {
    margin-top: auto;
  }

  /* The bib: the signal slab with the paper number cut out of it. */
  .bib {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    margin: var(--space-6);
    padding: var(--space-12);
    border-radius: var(--radius-s);
    background: var(--signal);
    color: var(--on-signal);
    overflow: hidden;
  }
  .number {
    font-size: min(38vw, 520px);
    line-height: 0.8;
    font-weight: 820;
    font-variation-settings: "wdth" 62;
    letter-spacing: -0.03em;
    color: var(--paper);
  }
  .tagline {
    max-width: 30ch;
    margin-top: var(--space-6);
    font-size: 15px;
    line-height: 22px;
    font-weight: 560;
  }
  .pin {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--on-signal);
    background: var(--paper);
  }
  .tl {
    top: 20px;
    left: 20px;
  }
  .tr {
    top: 20px;
    right: 20px;
  }
  .bl {
    bottom: 20px;
    left: 20px;
  }
  .br {
    bottom: 20px;
    right: 20px;
  }

  @media (max-width: 900px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
    }
    .bib {
      display: none;
    }
    main {
      padding: var(--space-8) var(--space-4);
    }
  }
</style>
