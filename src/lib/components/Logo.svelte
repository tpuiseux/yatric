<script lang="ts">
  /** The Yatric wordmark (Yet Another TRIathlon Coach). */
  interface Props {
    size?: number;
  }

  let { size = 28 }: Props = $props();
</script>

<span class="logo" style:--size="{size}px">yatric</span>

<style>
  .logo {
    display: inline-block;
    color: var(--text-primary);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: calc(var(--size) * 0.82);
    letter-spacing: -0.04em;
    line-height: 1;
  }
</style>
