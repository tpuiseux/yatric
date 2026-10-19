<script lang="ts">
  import { enhance } from "$app/forms";
  import { base } from "$app/paths";
  import AuthShell from "$lib/components/AuthShell.svelte";
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form: ActionData;
  }

  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>Log in — Yatric</title>
</svelte:head>

<AuthShell title="Welcome back" subtitle="Log in to your training plan.">
  <form method="POST" use:enhance>
    {#if form?.error}
      <p class="notice error">{form.error}</p>
    {/if}

    <label class="field">
      Email
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
      Password
      <input
        class="input"
        type="password"
        name="password"
        autocomplete="current-password"
        required
      />
    </label>

    <button class="btn btn-primary btn-lg" type="submit">Log in</button>

    {#if data.signupOpen}
      <p class="switch">No account yet? <a href="{base}/signup">Create one</a></p>
    {/if}
  </form>
</AuthShell>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  button {
    margin-top: 0.25rem;
  }

  .switch {
    text-align: center;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .switch a {
    color: var(--accent);
    font-weight: 550;
    text-decoration: none;
  }

  .switch a:hover {
    text-decoration: underline;
  }
</style>
