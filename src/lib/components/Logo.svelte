<script lang="ts">
  /** The Yatric wordmark (Yet Another TRIathlon Coach): the word, no symbol. */
  interface Props {
    size?: number;
  }

  let { size = 22 }: Props = $props();
</script>

<span class="y-wordmark" style:font-size="{size}px">yatric</span>
