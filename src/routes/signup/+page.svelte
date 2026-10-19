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
  <title>Create an account — Yatric</title>
</svelte:head>

<AuthShell title="Create your account" subtitle="Then the coach builds your plan with you.">
  <form method="POST" use:enhance>
    {#if form?.error}
      <p class="notice error">{form.error}</p>
    {/if}

    <label class="field">
      Invite code
      <input class="input" type="text" name="inviteCode" autocomplete="off" required />
    </label>

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
      <span>Name <span class="optional">(optional)</span></span>
      <input
        class="input"
        type="text"
        name="name"
        value={form?.name ?? ""}
        autocomplete="name"
        maxlength="100"
      />
    </label>

    <label class="field">
      Password
      <input
        class="input"
        type="password"
        name="password"
        autocomplete="new-password"
        minlength={data.minPasswordLength}
        required
      />
      <span class="hint">At least {data.minPasswordLength} characters.</span>
    </label>

    <label class="field">
      Confirm password
      <input
        class="input"
        type="password"
        name="confirmPassword"
        autocomplete="new-password"
        minlength={data.minPasswordLength}
        required
      />
    </label>

    <button class="btn btn-primary btn-lg" type="submit">Create account</button>

    <p class="switch">Already have an account? <a href="{base}/login">Log in</a></p>
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

  .optional,
  .hint {
    color: var(--text-muted);
    font-weight: 400;
  }

  .hint {
    font-size: 0.8rem;
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
