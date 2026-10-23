<script lang="ts">
  import "../lib/styles/global.css";
  import { setI18n } from "$lib/i18n/index.js";

  let { data, children } = $props();

  setI18n(() => data.locale);
</script>

{@render children()}
