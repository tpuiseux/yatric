<script lang="ts">
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { base } from "$app/paths";
  import type { PageData } from "./$types";
  import type { TrainingDay, Workout } from "../../../schema/training-plan.js";
  import {
    deriveSettingsFromPlan,
    buildZonesFromSettings,
    buildPreferencesFromSettings,
    type Settings,
  } from "$lib/settings.js";
  import AppBar, { type PlanView } from "$lib/components/AppBar.svelte";
  import TodaySection from "$lib/components/TodaySection.svelte";
  import WeekView from "$lib/components/WeekView.svelte";
  import PhaseStrip from "$lib/components/PhaseStrip.svelte";
  import RacePrediction from "$lib/components/RacePrediction.svelte";
  import WorkoutModal from "$lib/components/WorkoutModal.svelte";
  import ActivityModal from "$lib/components/ActivityModal.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import CoachPanel from "$lib/components/CoachPanel.svelte";
  import LoadPanel from "$lib/components/LoadPanel.svelte";
  import RecoverySignals from "$lib/components/RecoverySignals.svelte";
  import { getI18n } from "$lib/i18n/index.js";
  import { getTodayISO } from "$lib/utils.js";
  import { runSync } from "$lib/garminSyncClient.js";
  import { matchDay, type RecordedActivity } from "$lib/trainingLog.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  const settings = $derived(deriveSettingsFromPlan(data.plan));

  let view = $state<PlanView>("week");
  let coachOpen = $state(false);

  // The week on show: this one, else week 1 before the plan, else the last.
  const today = getTodayISO();
  function defaultWeek(): number {
    const weeks = data.plan.weeks ?? [];
    const current = weeks.find((w) => w.startDate <= today && today <= w.endDate);
    if (current) return current.weekNumber;
    if (weeks.length && today > weeks[weeks.length - 1].endDate) {
      return weeks[weeks.length - 1].weekNumber;
    }
    return weeks[0]?.weekNumber ?? 1;
  }
  let selectedWeek = $state(defaultWeek());

  let errorMessage = $state<string | null>(null);
  let settingsOpen = $state(false);

  type ModalState =
    | { mode: "view" | "edit"; workout: Workout; day: TrainingDay }
    | { mode: "create"; day: TrainingDay }
    | null;

  let modalState = $state<ModalState>(null);
  // A message to start the coach chat with (a week's review, a recovery signal).
  let coachRequest = $state<{ id: number; text: string } | null>(null);
  // An activity that matched nothing in the plan, opened for its details.
  let openActivity = $state<RecordedActivity | null>(null);

  // Pull new Garmin activities/recovery data when the plan is opened. The
  // server skips this if the last sync is under 6h old or Garmin isn't
  // connected; otherwise it runs in the background and the page refreshes
  // once it's done.
  let garminSyncing = $state(false);
  onMount(() => {
    runSync(false, () => (garminSyncing = true))
      .then((state) => (state ? invalidateAll() : undefined))
      .catch(() => {
        // Best-effort: Settings -> Garmin shows the sync state and any error.
      })
      .finally(() => (garminSyncing = false));
  });

  async function feedbackRequest(workoutId: string, init: RequestInit) {
    const res = await fetch(`${workoutsUrl(workoutId)}/feedback`, init);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? `Request failed (${res.status})`);
    }
    await invalidateAll();
  }

  async function handleSaveFeedback(workoutId: string, feedback: unknown) {
    await feedbackRequest(workoutId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feedback),
    });
    // The server marked it completed; reflect that in the open modal too.
    if (modalState && modalState.mode !== "create" && modalState.workout.id === workoutId) {
      modalState = { ...modalState, workout: { ...modalState.workout, completed: true } };
    }
  }

  async function handleDeleteFeedback(workoutId: string) {
    await feedbackRequest(workoutId, { method: "DELETE" });
  }

  const planDateRange = $derived.by(() => {
    const dates = (data.plan.weeks ?? []).flatMap((w) => (w.days ?? []).map((d) => d.date)).sort();
    return { min: dates[0] ?? "", max: dates[dates.length - 1] ?? "" };
  });

  async function request(path: string, init: RequestInit) {
    errorMessage = null;
    try {
      const res = await fetch(path, init);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? m.common.requestFailed(res.status));
      }
      await invalidateAll();
      return await res.json();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : m.common.somethingWrong;
      throw err;
    }
  }

  function workoutsUrl(workoutId?: string) {
    const path = `${base}/plans/${page.params.id}/workouts`;
    return workoutId ? `${path}/${workoutId}` : path;
  }

  function handleWorkoutClick(workout: Workout, day: TrainingDay) {
    modalState = { mode: "view", workout, day };
  }

  function handleAddWorkout(day: TrainingDay) {
    modalState = { mode: "create", day };
  }

  function handleWorkoutMove(workoutId: string, newDate: string) {
    request(workoutsUrl(workoutId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", newDate }),
    });
  }

  async function handleMoveFromModal(workoutId: string, newDate: string) {
    try {
      await request(workoutsUrl(workoutId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", newDate }),
      });
    } catch {
      // request() already put the message in the error banner
    } finally {
      // Close even on failure: on a phone the modal is full-screen and would
      // hide the error banner behind it.
      modalState = null;
    }
  }

  async function handleToggleComplete(workoutId: string) {
    await request(workoutsUrl(workoutId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle-complete" }),
    });
    // Reflect the toggle immediately in the open modal instead of closing it.
    if (modalState && modalState.mode === "view" && modalState.workout.id === workoutId) {
      modalState = {
        ...modalState,
        workout: { ...modalState.workout, completed: !modalState.workout.completed },
      };
    }
  }

  async function handleSave(updates: Partial<Workout>) {
    if (!modalState) return;

    if (modalState.mode === "create") {
      await request(workoutsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: modalState.day.date, workout: updates }),
      });
    } else {
      await request(workoutsUrl(modalState.workout.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", updates }),
      });
    }
    modalState = null;
  }

  async function handleDelete(workoutId: string) {
    await request(workoutsUrl(workoutId), { method: "DELETE" });
    modalState = null;
  }

  async function handleSettingsChange(newSettings: Settings) {
    await request(`${base}/plans/${page.params.id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: buildPreferencesFromSettings(newSettings),
        zones: buildZonesFromSettings(newSettings),
      }),
    });
  }

  const planTotals = $derived.by(() => {
    let minutes = 0;
    let sessions = 0;
    let done = 0;
    for (const w of data.plan.weeks ?? []) {
      for (const d of w.days ?? []) {
        for (const x of d.workouts ?? []) {
          if (x.sport === "rest") continue;
          sessions++;
          minutes += x.durationMinutes ?? 0;
        }
      }
    }
    // Done as the week reviews count it: ticked, or recorded on the watch.
    for (const r of Object.values(data.weekReviews)) done += r.sessions.done;
    return { minutes, sessions, done };
  });

  function askCoach(text: string) {
    coachRequest = { id: Date.now(), text };
    coachOpen = true;
  }

  function handleExportPlan() {
    const blob = new Blob([JSON.stringify(data.plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.plan.meta.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>{data.plan.meta.event} · Yatric</title>
</svelte:head>

<AppBar
  plan={data.plan}
  {view}
  onView={(v) => (view = v)}
  {coachOpen}
  onToggleCoach={() => (coachOpen = !coachOpen)}
  onSettings={() => (settingsOpen = true)}
/>

<div class="layout" class:coach-open={coachOpen}>
  <main>
    {#if errorMessage}
      <div class="notice error" role="alert">{errorMessage}</div>
    {/if}

    {#if view === "week"}
      <TodaySection
        plan={data.plan}
        activitiesByDate={data.activitiesByDate}
        feedback={data.feedback}
        prediction={data.prediction}
        {settings}
        recoveryDays={data.load?.days ?? []}
        onWorkoutClick={handleWorkoutClick}
        onAskCoach={askCoach}
        onOpenRecovery={() => (view = "recovery")}
      />
      <WeekView
        plan={data.plan}
        bind:selected={selectedWeek}
        activitiesByDate={data.activitiesByDate}
        feedback={data.feedback}
        {settings}
        weekReviews={data.weekReviews}
        onWorkoutClick={handleWorkoutClick}
        onWorkoutMove={handleWorkoutMove}
        onAddWorkout={handleAddWorkout}
        onActivityClick={(activity) => (openActivity = activity)}
        onReviewWeek={(week) =>
          askCoach(
            m.week.reviewMessage(
              week.weekNumber,
              fmt.date(week.startDate, "dayMonth"),
              fmt.date(week.endDate, "dayMonth")
            )
          )}
      />
      <section class="strip">
        <h2 class="title-m">{m.plan.title}</h2>
        <PhaseStrip
          plan={data.plan}
          weekReviews={data.weekReviews}
          onSelect={(n) => (selectedWeek = n)}
        />
      </section>
    {:else if view === "plan"}
      <section class="plan-view">
        <h2 class="title-m">{m.plan.title}</h2>
        <dl class="stats">
          <div>
            <dt>{m.plan.weeks}</dt>
            <dd class="figure-m">{data.plan.meta.totalWeeks ?? data.plan.weeks.length}</dd>
          </div>
          <div>
            <dt>{m.plan.hours}</dt>
            <dd class="figure-m">{fmt.duration(planTotals.minutes)}</dd>
          </div>
          <div>
            <dt>{m.plan.done}</dt>
            <dd class="figure-m">
              {planTotals.done}<span class="of">/{planTotals.sessions}</span>
            </dd>
          </div>
        </dl>
        <PhaseStrip
          plan={data.plan}
          weekReviews={data.weekReviews}
          onSelect={(n) => {
            selectedWeek = n;
            view = "week";
          }}
        />
        {#if data.prediction}
          <div class="prediction">
            <RacePrediction prediction={data.prediction} {settings} />
          </div>
        {/if}
      </section>
    {:else if data.load}
      <LoadPanel load={data.load} planStartDate={data.plan.meta.planStartDate}>
        <RecoverySignals days={data.load.days} onAskCoach={askCoach} />
      </LoadPanel>
    {:else}
      <section class="plan-view">
        <h2 class="title-m">{m.recovery.title}</h2>
        <p class="muted">{m.recovery.empty}</p>
      </section>
    {/if}
  </main>

  <CoachPanel
    planId={page.params.id ?? ""}
    request={coachRequest}
    bind:open={coachOpen}
    onPlanChanged={() => invalidateAll()}
  />
</div>

{#if garminSyncing}
  <div class="sync-pill" role="status">{m.sync.syncing}</div>
{/if}

{#if modalState}
  <WorkoutModal
    workout={modalState.mode === "create" ? null : modalState.workout}
    day={modalState.day}
    mode={modalState.mode}
    planId={page.params.id ?? ""}
    {settings}
    onClose={() => (modalState = null)}
    onToggleComplete={handleToggleComplete}
    onSave={handleSave}
    onDelete={handleDelete}
    onMove={handleMoveFromModal}
    {planDateRange}
    feedback={modalState.mode === "create" ? undefined : data.feedback[modalState.workout.id]}
    recordedActivities={modalState.mode === "create"
      ? []
      : (matchDay(modalState.day.workouts ?? [], data.activitiesByDate[modalState.day.date] ?? [])
          .byWorkout[modalState.workout.id] ?? [])}
    onSaveFeedback={handleSaveFeedback}
    onDeleteFeedback={handleDeleteFeedback}
  />
{/if}

{#if openActivity}
  <ActivityModal activity={openActivity} {settings} onClose={() => (openActivity = null)} />
{/if}

{#if settingsOpen}
  <SettingsModal
    {settings}
    onClose={() => (settingsOpen = false)}
    onChange={handleSettingsChange}
    onExportPlan={handleExportPlan}
    onGarminSynced={() => invalidateAll()}
  />
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: calc(100vh - 57px);
  }
  .layout.coach-open {
    grid-template-columns: minmax(0, 1fr) var(--coach-width);
  }
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    width: 100%;
    max-width: 1280px;
    margin-inline: auto;
    min-width: 0;
    padding: var(--space-8) var(--space-8) var(--space-12);
  }

  .strip {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .plan-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6) var(--space-12);
  }
  .stats div {
    display: flex;
    flex-direction: column-reverse;
    gap: var(--space-1);
  }
  .stats dt {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .of {
    font-size: 0.55em;
    color: var(--ink-muted);
  }
  .prediction {
    padding-top: var(--space-8);
    border-top: 1px solid var(--line);
  }

  .sync-pill {
    position: fixed;
    left: var(--space-4);
    bottom: var(--space-4);
    z-index: 40;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--sheet);
    box-shadow: var(--shadow-float);
    color: var(--ink-muted);
    font-size: 13px;
    pointer-events: none;
  }

  @media (max-width: 1200px) {
    .layout.coach-open {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 800px) {
    main {
      gap: var(--space-8);
      padding: var(--space-4) var(--space-4) calc(56px + var(--space-8));
    }
    .sync-pill {
      bottom: calc(56px + var(--space-4));
    }
  }
</style>
