<script lang="ts">
  import type { Snippet } from "svelte";
  import Logo from "./Logo.svelte";

  /** The frame around the login and sign-up forms. */
  interface Props {
    title: string;
    subtitle: string;
    children: Snippet;
  }

  let { title, subtitle, children }: Props = $props();
</script>

<main>
  <div class="panel">
    <Logo size={34} />
    <div class="heading">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {@render children()}
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    background:
      radial-gradient(60rem 30rem at 50% -10%, var(--accent-glow), transparent 70%),
      var(--bg-primary);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 380px;
    padding: 2.25rem 2rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--bg-secondary);
    box-shadow: var(--shadow-pop);
  }

  .heading h1 {
    font-size: 1.45rem;
    font-weight: 650;
  }

  .heading p {
    margin-top: 0.3rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  @media (max-width: 480px) {
    main {
      align-items: flex-start;
      padding-top: 3rem;
    }

    .panel {
      padding: 1.75rem 1.25rem;
      box-shadow: none;
    }
  }
</style>
