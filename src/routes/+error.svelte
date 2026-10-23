<script lang="ts">
  import { base } from "$app/paths";
  import { page } from "$app/state";
  import Logo from "$lib/components/Logo.svelte";
  import { getI18n } from "$lib/i18n/index.js";

  const i18n = getI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head>
  <title>{page.status} · Yatric</title>
</svelte:head>

<main>
  <a href="{base}/" class="home"><Logo /></a>
  <span class="figure-xl">{page.status}</span>
  <p>{page.status === 404 ? m.error.notFound : m.error.generic}</p>
  <div><a class="btn btn-primary" href="{base}/">{m.error.back}</a></div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 560px;
    padding: var(--space-12) var(--space-8);
  }
  .home {
    display: flex;
    text-decoration: none;
  }
</style>
