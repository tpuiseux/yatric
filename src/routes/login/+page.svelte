<script lang="ts">
  import { enhance } from "$app/forms";
  import { base } from "$app/paths";
  import AuthShell from "$lib/components/AuthShell.svelte";
  import { getI18n } from "$lib/i18n/index.js";
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form: ActionData;
  }

  let { data, form }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head>
  <title>{m.auth.pageLogin} · Yatric</title>
</svelte:head>

<AuthShell>
  <form method="POST" use:enhance>
    {#if form?.error}
      <p class="notice error" role="alert">{m.auth.errors[form.error]?.(form.n ?? 0)}</p>
    {/if}

    <label class="field">
      {m.auth.email}
      <input
        class="input"
        type="email"
        name="email"
        value={form?.email ?? ""}
        autocomplete="email"
        required
      />
    </label>

    <label class="field">
      {m.auth.password}
      <input
        class="input"
        type="password"
        name="password"
        autocomplete="current-password"
        required
      />
    </label>

    <button class="btn btn-primary btn-lg" type="submit">{m.auth.logIn}</button>

    {#if data.signupOpen}
      <p class="switch">{m.auth.noAccount} <a href="{base}/signup">{m.auth.createOne}</a></p>
    {/if}
  </form>
</AuthShell>
