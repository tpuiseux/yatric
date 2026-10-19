<script lang="ts">
  /** The Yatric mark, with the wordmark unless `markOnly`. */
  interface Props {
    size?: number;
    markOnly?: boolean;
  }

  let { size = 28, markOnly = false }: Props = $props();
</script>

<span class="logo" style:--size="{size}px">
  <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="var(--accent)" />
    <path
      d="M19 17 L32 34 L45 17 M32 34 L28 48"
      fill="none"
      stroke="var(--accent-ink)"
      stroke-width="7"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  {#if !markOnly}
    <span class="word">yatric</span>
  {/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--size) * 0.32);
    color: var(--text-primary);
  }

  .mark {
    width: var(--size);
    height: var(--size);
    flex-shrink: 0;
  }

  .word {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: calc(var(--size) * 0.82);
    letter-spacing: -0.04em;
    line-height: 1;
  }
</style>
