<script lang="ts">
  import { tick } from "svelte";
  import { base } from "$app/paths";
  import type {
    ChangePreview,
    CoachChatMessage,
    CoachEvent,
    CoachProposal,
    WorkoutSnapshot,
  } from "../coach.js";
  import type { GuardrailNote } from "../guardrails.js";
  import { renderMarkdown } from "../markdown.js";
  import { getI18n } from "../i18n/index.js";

  /**
   * The coach chat, docked beside the plan on a wide screen and over it on
   * a smaller one: the conversation, the plan changes it proposes, and a box
   * to write in.
   */
  interface Props {
    planId: string;
    /** Opens the chat with this message ready to send (a new id each time). */
    request?: { id: number; text: string } | null;
    open: boolean;
    /** After a proposal is applied or undone - the page reloads the plan. */
    onPlanChanged: () => Promise<void> | void;
  }

  let { planId, request = null, open = $bindable(), onPlanChanged }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  let loaded = $state(false);
  let configured = $state(true);
  let messages = $state<CoachChatMessage[]>([]);
  let proposals = $state<Record<number, CoachProposal>>({});
  let draft = $state("");
  let sending = $state(false);
  /** What the coach is doing right now, while it answers. */
  let status = $state<string | null>(null);
  let errorText = $state<string | null>(null);
  let busyProposal = $state<number | null>(null);

  let listEl = $state<HTMLElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);

  const url = $derived(`${base}/plans/${planId}/coach`);

  async function scrollToEnd() {
    await tick();
    listEl?.scrollTo({ top: listEl.scrollHeight });
  }

  async function load() {
    errorText = null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(m.common.requestFailed(res.status));
      const data = await res.json();
      configured = data.configured;
      messages = data.messages;
      proposals = Object.fromEntries((data.proposals as CoachProposal[]).map((p) => [p.id, p]));
      loaded = true;
      await scrollToEnd();
    } catch (err) {
      errorText = err instanceof Error ? err.message : m.common.somethingWrong;
    }
  }

  let lastRequest = 0;
  $effect(() => {
    if (!request || request.id === lastRequest) return;
    lastRequest = request.id;
    draft = request.text;
    open = true;
    tick().then(() => inputEl?.focus());
  });

  // Load the conversation the first time the panel opens.
  $effect(() => {
    if (open && !loaded) load().then(() => inputEl?.focus());
  });

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    draft = "";
    errorText = null;
    sending = true;
    status = m.coach.thinking;
    messages.push({ id: -Date.now(), role: "user", text, activity: [], proposalIds: [] });
    const reply: CoachChatMessage = {
      id: -Date.now() - 1,
      role: "assistant",
      text: "",
      activity: [],
      proposalIds: [],
    };
    messages.push(reply);
    // The pushed object is proxied; edit it through the array.
    const replyIndex = messages.length - 1;
    await scrollToEnd();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? m.coach.couldNotAnswer);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handleEvent(JSON.parse(line) as CoachEvent, replyIndex);
        }
        await scrollToEnd();
      }
    } catch (err) {
      errorText = err instanceof Error ? err.message : m.coach.couldNotAnswer;
    } finally {
      sending = false;
      status = null;
      // An empty reply bubble (error before any text) isn't worth keeping.
      const r = messages[replyIndex];
      if (r && !r.text && r.proposalIds.length === 0) messages.splice(replyIndex, 1);
      await scrollToEnd();
    }
  }

  function handleEvent(event: CoachEvent, replyIndex: number) {
    const reply = messages[replyIndex];
    switch (event.type) {
      case "text":
        reply.text += event.delta;
        status = null;
        break;
      case "activity":
        reply.activity.push(event.label);
        status = `${m.coach.working[event.label] ?? event.label}…`;
        break;
      case "proposal":
        proposals[event.proposal.id] = event.proposal;
        reply.proposalIds.push(event.proposal.id);
        break;
      case "error":
        errorText = event.message;
        break;
      case "done":
        status = null;
        break;
    }
  }

  async function answer(proposal: CoachProposal, action: "apply" | "reject" | "undo") {
    busyProposal = proposal.id;
    errorText = null;
    try {
      const res = await fetch(`${url}/proposals/${proposal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? m.common.requestFailed(res.status));
      proposals[proposal.id] = body.proposal;
      if (action !== "reject") await onPlanChanged();
    } catch (err) {
      errorText = err instanceof Error ? err.message : m.common.somethingWrong;
    } finally {
      busyProposal = null;
    }
  }

  async function newConversation() {
    if (sending) return;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      messages = [];
      proposals = {};
      errorText = null;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function looked(tools: string[]): string {
    const what = [...new Set(tools)]
      .filter((t) => t !== "propose_plan_changes" && t !== "save_week_review")
      .map((t) => m.coach.tools[t] ?? t);
    return what.length ? m.coach.looked(what.join(", ")) : "";
  }

  function warning(w: GuardrailNote): string {
    const p = w.params as Record<string, string & number>;
    switch (w.rule) {
      case "volume_jump":
        return m.guardrails.volume_jump({
          week: p.week,
          hours: fmt.duration(p.minutes),
          pct: p.pct,
          biggest: fmt.duration(p.biggest),
          limit: p.limit,
        });
      case "monotony":
        return m.guardrails.monotony({
          week: p.week,
          value: fmt.number(p.value, 1),
          limit: p.limit,
        });
      case "long_run_share":
        return m.guardrails.long_run_share({
          week: p.week,
          name: p.name,
          pct: p.pct,
          limit: p.limit,
        });
      case "consecutive_quality":
        return m.guardrails.consecutive_quality({
          a: p.a,
          b: p.b,
          dates:
            p.dateA === p.dateB
              ? m.guardrails.sameDay(fmt.date(p.dateA, "short"))
              : m.guardrails.twoDays(fmt.date(p.dateA, "short"), fmt.date(p.dateB, "short")),
        });
      case "quality_after_red":
        return m.guardrails.quality_after_red({ name: p.name, date: fmt.date(p.date, "short") });
    }
    return w.text;
  }

  function when(w: WorkoutSnapshot): string {
    return fmt.date(w.date, "long");
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && open && (open = false)} />

{#if open}
  <aside class="coach" aria-label={m.coach.title}>
    <header>
      <h2 class="title-s">{m.coach.title}</h2>
      <div class="header-actions">
        {#if messages.length > 0}
          <button class="btn btn-ghost btn-sm" onclick={newConversation} disabled={sending}
            >{m.coach.newConversation}</button
          >
        {/if}
        <button
          class="btn btn-ghost btn-icon btn-sm"
          onclick={() => (open = false)}
          aria-label={m.coach.collapse}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </header>

    <div class="thread" bind:this={listEl}>
      {#if !configured}
        <p class="muted">{m.coach.notConfigured}</p>
      {:else if loaded && messages.length === 0}
        <div class="intro">
          <p class="muted">{m.coach.intro}</p>
          <div class="suggestions">
            {#each m.coach.suggestions as s (s)}
              <button class="btn btn-sm" onclick={() => ((draft = s), inputEl?.focus())}>{s}</button
              >
            {/each}
          </div>
        </div>
      {/if}

      {#each messages as msg (msg.id)}
        {#if msg.role === "assistant"}
          {#if msg.text}
            <div class="msg coach-msg">
              <span class="who">{m.coach.title}</span>
              <div class="markdown">{@html renderMarkdown(msg.text)}</div>
              {#if looked(msg.activity)}<span class="looked">{looked(msg.activity)}</span>{/if}
            </div>
          {/if}
          {#each msg.proposalIds as pid (pid)}
            {@const p = proposals[pid]}
            {#if p}
              <div class="proposal" class:settled={p.status !== "pending"}>
                <div class="proposal-head">
                  <span class="proposal-title">{p.summary}</span>
                  {#if p.status !== "pending"}
                    <span class="proposal-status" class:applied={p.status === "applied"}
                      >{m.coach.status[p.status]}</span
                    >
                  {/if}
                </div>
                <ul class="changes">
                  {#each p.changes as c, i (i)}
                    <li class="change">
                      <span class="op">{m.coach.ops[c.op]}</span>
                      <div class="what">
                        {#if c.op === "move" && c.before && c.after}
                          <div>{c.before.name}</div>
                          <div><s class="muted">{when(c.before)}</s> {when(c.after)}</div>
                        {:else if c.op === "edit" && c.before && c.after}
                          <div>
                            {#if c.before.name !== c.after.name}<s class="muted">{c.before.name}</s
                              >{" "}{/if}{c.after.name}, {when(c.after)}
                          </div>
                          {#if c.before.durationMinutes !== c.after.durationMinutes}
                            <div class="num">
                              <s class="muted">{fmt.duration(c.before.durationMinutes ?? 0)}</s>
                              {fmt.duration(c.after.durationMinutes ?? 0)}
                            </div>
                          {/if}
                        {:else if c.after}
                          <div>
                            {c.after.name}{c.after.durationMinutes
                              ? `, ${fmt.duration(c.after.durationMinutes)}`
                              : ""}
                          </div>
                          <div class="muted">{when(c.after)}</div>
                        {:else if c.before}
                          <div><s>{c.before.name}</s></div>
                          <div class="muted">{when(c.before)}</div>
                        {/if}
                        {#if c.reason}<div class="why">{c.reason}</div>{/if}
                      </div>
                    </li>
                  {/each}
                </ul>
                {#if p.warnings?.length}
                  <ul class="warnings" role="note">
                    {#each p.warnings as w, i (i)}
                      <li>{warning(w)}</li>
                    {/each}
                  </ul>
                {/if}
                {#if p.status === "pending" || p.status === "applied"}
                  <div class="proposal-actions">
                    {#if p.status === "pending"}
                      <button
                        class="btn btn-primary btn-sm"
                        disabled={busyProposal === p.id}
                        onclick={() => answer(p, "apply")}>{m.coach.apply}</button
                      >
                      <button
                        class="btn btn-ghost btn-sm"
                        disabled={busyProposal === p.id}
                        onclick={() => answer(p, "reject")}>{m.coach.reject}</button
                      >
                    {:else}
                      <button
                        class="btn btn-sm"
                        disabled={busyProposal === p.id}
                        onclick={() => answer(p, "undo")}>{m.coach.undo}</button
                      >
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        {:else}
          <div class="msg athlete-msg">{msg.text}</div>
        {/if}
      {/each}

      {#if status}
        <div class="looked" role="status">{status}</div>
      {/if}
      {#if errorText}
        <div class="notice error" role="alert">{errorText}</div>
      {/if}
    </div>

    <form
      class="composer"
      onsubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        class="input"
        bind:this={inputEl}
        bind:value={draft}
        onkeydown={onKeydown}
        rows="2"
        aria-label={m.coach.placeholder}
        placeholder={m.coach.placeholder}
        disabled={!configured}
      ></textarea>
      <button
        type="submit"
        class="btn btn-primary"
        disabled={sending || !draft.trim() || !configured}
      >
        {m.coach.send}
      </button>
    </form>
  </aside>
{/if}

<style>
  /* The header keeps its height; only the middle scrolls. */
  header,
  .composer {
    flex-shrink: 0;
  }
  .coach {
    position: sticky;
    top: 57px;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 57px);
    border-left: 1px solid var(--line);
    background: var(--paper);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4) var(--space-2) var(--space-6);
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  header svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }

  .thread {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-6) var(--space-4);
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    font-size: 14px;
  }
  .suggestions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .suggestions .btn {
    height: auto;
    min-height: 32px;
    padding: 6px var(--space-3);
    white-space: normal;
    text-align: left;
    font-weight: 500;
  }

  .msg {
    font-size: 15px;
    line-height: 22px;
    overflow-wrap: anywhere;
  }
  .who {
    display: block;
    margin-bottom: var(--space-1);
    font-size: 13px;
    font-weight: 650;
    color: var(--signal);
  }
  .athlete-msg {
    align-self: flex-end;
    max-width: 85%;
    padding: 10px var(--space-3);
    border-radius: var(--radius-m) var(--radius-m) var(--radius-s) var(--radius-m);
    background: var(--sunk);
    white-space: pre-wrap;
  }
  .looked {
    display: block;
    margin-top: var(--space-2);
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
  }

  .proposal {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-m);
    background: var(--sheet);
    border: 1px solid var(--line);
  }
  .proposal-head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .proposal-title {
    font-weight: 650;
  }
  .proposal-status {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .proposal-status.applied {
    color: var(--success);
  }
  .changes {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
  }
  .change {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: var(--space-3);
    font-size: 14px;
    line-height: 20px;
  }
  .op {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-muted);
  }
  .what {
    min-width: 0;
  }
  .why {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .warnings {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-s);
    background: var(--warning-soft);
    font-size: 13px;
    line-height: 18px;
  }
  .proposal-actions {
    display: flex;
    gap: var(--space-2);
  }

  .composer {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4) var(--space-4);
    border-top: 1px solid var(--line);
  }
  .composer textarea {
    min-height: 44px;
    max-height: 160px;
  }

  @media (max-width: 1200px) {
    .coach {
      position: fixed;
      top: 57px;
      right: 0;
      bottom: 0;
      z-index: 35;
      width: min(var(--coach-width), 100vw);
      height: auto;
      box-shadow: var(--shadow-float);
    }
  }
  @media (max-width: 800px) {
    .coach {
      left: 0;
      width: auto;
      bottom: calc(56px + env(safe-area-inset-bottom, 0px));
      border-left: 0;
      box-shadow: none;
    }
    header {
      padding-left: var(--space-4);
    }
    .thread {
      padding: var(--space-2) var(--space-4) var(--space-4);
    }
  }
</style>
