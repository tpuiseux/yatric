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
  <title>{m.auth.pageSignup} · Yatric</title>
</svelte:head>

<AuthShell title={m.auth.signupTitle} subtitle={m.auth.signupSubtitle}>
  <form method="POST" use:enhance>
    {#if form?.error}
      <p class="notice error" role="alert">{m.auth.errors[form.error]?.(form.n ?? 0)}</p>
    {/if}

    <label class="field">
      {m.auth.inviteCode}
      <input class="input" type="text" name="inviteCode" autocomplete="off" required />
    </label>

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
      {m.auth.name}
      <input
        class="input"
        type="text"
        name="name"
        value={form?.name ?? ""}
        autocomplete="given-name"
        maxlength="100"
      />
      <span class="field-hint">{m.auth.optional}</span>
    </label>

    <label class="field">
      {m.auth.password}
      <input
        class="input"
        type="password"
        name="password"
        autocomplete="new-password"
        minlength={data.minPasswordLength}
        required
      />
      <span class="field-hint">{m.auth.passwordHint(data.minPasswordLength)}</span>
    </label>

    <label class="field">
      {m.auth.confirmPassword}
      <input
        class="input"
        type="password"
        name="confirmPassword"
        autocomplete="new-password"
        minlength={data.minPasswordLength}
        required
      />
    </label>

    <button class="btn btn-primary btn-lg" type="submit">{m.auth.createAccount}</button>

    <p class="switch">{m.auth.haveAccount} <a href="{base}/login">{m.auth.logIn}</a></p>
  </form>
</AuthShell>
