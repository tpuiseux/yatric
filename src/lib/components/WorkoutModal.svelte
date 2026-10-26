<script lang="ts">
  import { untrack } from "svelte";
  import { base } from "$app/paths";
  import type { Workout, TrainingDay, Sport, WorkoutType } from "../../schema/training-plan.js";
  import type { Settings } from "../settings.js";
  import { getZoneInfo } from "../utils.js";
  import {
    FEELINGS,
    type Feeling,
    type RecordedActivity,
    type WorkoutFeedback,
  } from "../trainingLog.js";
  import { getI18n } from "../i18n/index.js";
  import { distance as formatDistance, activityParts } from "../format.js";
  import { intensityOf, workoutProfile } from "../intensity.js";
  import { isGarminConnectSupported } from "../garminSports.js";
  import ActivityAnalysis from "./ActivityAnalysis.svelte";
  import {
    exportWorkout,
    getAvailableFormats,
    isZwoSupported,
    isFitSupported,
    isErgSupported,
    type ExportFormat,
  } from "../export/index.js";

  type Mode = "view" | "edit" | "create";

  interface Props {
    workout: Workout | null; // null for create mode
    day: TrainingDay;
    settings: Settings;
    planId: string;
    mode?: Mode;
    onClose: () => void;
    onToggleComplete: (workoutId: string) => void;
    onSave: (updates: Partial<Workout>) => void;
    onDelete: (workoutId: string) => void;
    // Tap-friendly alternative to dragging a card onto another day, which
    // doesn't work on touch screens. Bounds limit the date picker to the plan.
    onMove: (workoutId: string, newDate: string) => void;
    planDateRange: { min: string; max: string };
    feedback?: WorkoutFeedback;
    /** Garmin activities matched to this workout (see matchDay). */
    recordedActivities: RecordedActivity[];
    /** Rejects with a user-facing message on failure. */
    onSaveFeedback: (workoutId: string, feedback: FeedbackDraft) => Promise<void>;
    onDeleteFeedback: (workoutId: string) => Promise<void>;
  }

  interface FeedbackDraft {
    rpe: number | null;
    feeling: Feeling | null;
    pain: boolean;
    painNotes: string | null;
    notes: string | null;
  }

  const i18n = getI18n();
  const m = $derived(i18n.m);
  const fmt = $derived(i18n.fmt);

  let {
    workout,
    day,
    settings,
    planId,
    mode = "view",
    onClose,
    onToggleComplete,
    onSave,
    onDelete,
    onMove,
    planDateRange,
    feedback,
    recordedActivities,
    onSaveFeedback,
    onDeleteFeedback,
  }: Props = $props();

  // How-did-it-go form (view mode). Starts closed; opened empty or prefilled.
  let editingFeedback = $state(false);
  let fbRpe = $state<number | null>(null);
  let fbFeeling = $state<Feeling | null>(null);
  let fbPain = $state(false);
  let fbPainNotes = $state("");
  let fbNotes = $state("");
  let fbSaving = $state(false);
  let fbError = $state<string | null>(null);

  function startFeedbackEdit() {
    fbRpe = feedback?.rpe ?? null;
    fbFeeling = feedback?.feeling ?? null;
    fbPain = feedback?.pain ?? false;
    fbPainNotes = feedback?.painNotes ?? "";
    fbNotes = feedback?.notes ?? "";
    fbError = null;
    editingFeedback = true;
  }

  const feedbackIsEmpty = $derived(
    fbRpe === null && fbFeeling === null && !fbPain && !fbNotes.trim()
  );

  async function saveFeedback() {
    if (!workout || fbSaving) return;
    fbSaving = true;
    fbError = null;
    try {
      await onSaveFeedback(workout.id, {
        rpe: fbRpe,
        feeling: fbFeeling,
        pain: fbPain,
        painNotes: fbPain ? fbPainNotes.trim() || null : null,
        notes: fbNotes.trim() || null,
      });
      editingFeedback = false;
    } catch (err) {
      fbError = err instanceof Error ? err.message : m.drawer.couldNotSave;
    } finally {
      fbSaving = false;
    }
  }

  async function removeFeedback() {
    if (!workout || fbSaving) return;
    fbSaving = true;
    fbError = null;
    try {
      await onDeleteFeedback(workout.id);
      editingFeedback = false;
    } catch (err) {
      fbError = err instanceof Error ? err.message : m.drawer.couldNotRemove;
    } finally {
      fbSaving = false;
    }
  }

  // Use untrack to explicitly capture initial values (these are intentional local copies)
  let currentMode = $state<Mode>(untrack(() => mode));
  let showDeleteConfirm = $state(false);
  let showMovePanel = $state(false);
  let moveDate = $state(untrack(() => day.date));
  let showExportMenu = $state(false);
  let exportStatus = $state<{ message: string; isError: boolean } | null>(null);

  // Editable fields - intentionally capture initial values only
  let editSport = $state<Sport>(untrack(() => workout?.sport || "run"));
  let editType = $state<WorkoutType>(untrack(() => workout?.type || "endurance"));
  let editName = $state(untrack(() => workout?.name || ""));
  let editDescription = $state(untrack(() => workout?.description || ""));
  let editDuration = $state(untrack(() => workout?.durationMinutes?.toString() || ""));
  let editDistance = $state(untrack(() => workout?.distanceMeters?.toString() || ""));
  let editZone = $state(untrack(() => workout?.primaryZone || ""));
  let editStructure = $state(untrack(() => workout?.humanReadable || ""));

  const sports: Sport[] = ["swim", "bike", "run", "strength", "brick", "race", "rest"];
  const workoutTypes: WorkoutType[] = [
    "rest",
    "recovery",
    "endurance",
    "tempo",
    "threshold",
    "intervals",
    "vo2max",
    "sprint",
    "race",
    "brick",
    "technique",
    "openwater",
    "hills",
    "long",
  ];

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (showDeleteConfirm) {
        showDeleteConfirm = false;
      } else if (currentMode !== "view") {
        if (!workout) {
          onClose();
        } else {
          currentMode = "view";
        }
      } else {
        onClose();
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains("overlay")) {
      onClose();
    }
  }

  function startEdit() {
    editSport = workout?.sport || "run";
    editType = workout?.type || "endurance";
    editName = workout?.name || "";
    editDescription = workout?.description || "";
    editDuration = workout?.durationMinutes?.toString() || "";
    editDistance = workout?.distanceMeters?.toString() || "";
    editZone = workout?.primaryZone || "";
    editStructure = workout?.humanReadable || "";
    currentMode = "edit";
  }

  function cancelEdit() {
    if (mode === "create") {
      onClose();
    } else {
      currentMode = "view";
    }
  }

  function handleSave() {
    const updates: Partial<Workout> = {
      sport: editSport,
      type: editType,
      name: editName,
      description: editDescription,
      durationMinutes: editDuration ? parseInt(editDuration) : undefined,
      distanceMeters: editDistance ? parseInt(editDistance) : undefined,
      primaryZone: editZone || undefined,
      humanReadable: editStructure || undefined,
    };
    onSave(updates);
    if (mode !== "create") {
      currentMode = "view";
    }
  }

  function handleDelete() {
    if (workout) {
      onDelete(workout.id);
    }
  }

  async function handleExport(format: ExportFormat) {
    if (!workout) return;
    showExportMenu = false;
    exportStatus = { message: m.drawer.exporting, isError: false };

    const result = await exportWorkout(workout, format, settings);

    if (result.success) {
      exportStatus = { message: m.drawer.downloaded(result.filename ?? ""), isError: false };
    } else {
      exportStatus = { message: result.error || m.drawer.exportFailed, isError: true };
    }

    setTimeout(() => {
      exportStatus = null;
    }, 3000);
  }

  const availableFormats = $derived(workout ? getAvailableFormats(workout.sport) : []);
  const canExport = $derived(availableFormats.length > 0);

  let garminSending = $state(false);

  async function handleSendToGarmin() {
    if (!workout || garminSending) return;
    garminSending = true;
    exportStatus = { message: m.drawer.sending, isError: false };

    try {
      const res = await fetch(`${base}/plans/${planId}/workouts/${workout.id}/garmin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day.date }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? m.drawer.sendFailed);
      exportStatus = { message: m.drawer.sent, isError: false };
    } catch (err) {
      exportStatus = {
        message: err instanceof Error ? err.message : m.drawer.sendFailed,
        isError: true,
      };
    } finally {
      garminSending = false;
      setTimeout(() => {
        exportStatus = null;
      }, 4000);
    }
  }

  // Derive displayed workout (for view mode)
  const displayWorkout = $derived(
    workout ||
      ({
        id: "",
        sport: editSport,
        type: editType,
        name: editName,
        description: editDescription,
        durationMinutes: editDuration ? parseInt(editDuration) : undefined,
        distanceMeters: editDistance ? parseInt(editDistance) : undefined,
        primaryZone: editZone,
        humanReadable: editStructure,
        completed: false,
      } as Workout)
  );

  const intensity = $derived(intensityOf(displayWorkout));
  const kindLabel = $derived(
    displayWorkout.sport === "run"
      ? m.intensity[intensity]
      : (m.sport[displayWorkout.sport] ?? displayWorkout.sport)
  );
  const profile = $derived(workoutProfile(displayWorkout.structure));
  const profileMinutes = $derived(Math.round(profile.reduce((s, p) => s + p.seconds, 0) / 60));
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="overlay"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="drawer-title"
  tabindex="-1"
>
  <div class="drawer">
    <header>
      <div class="titles">
        {#if currentMode === "view"}
          <span class="small muted first-cap"
            >{m.drawer.meta(fmt.date(day.date, "long"), kindLabel)}</span
          >
          <h2 class="title-m" id="drawer-title">{displayWorkout.name}</h2>
        {:else}
          <span class="small muted first-cap">{fmt.date(day.date, "long")}</span>
          <h2 class="title-m" id="drawer-title">
            {currentMode === "create" ? m.drawer.newWorkout : m.drawer.editWorkout}
          </h2>
        {/if}
      </div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick={onClose} aria-label={m.common.close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </header>

    <div class="body">
      {#if currentMode === "view"}
        {#if displayWorkout.durationMinutes || displayWorkout.distanceMeters || displayWorkout.primaryZone}
          <div class="figures">
            {#if displayWorkout.durationMinutes}
              <div class="figure">
                <span class="figure-m">{fmt.duration(displayWorkout.durationMinutes)}</span>
                <span class="small muted">{m.drawer.duration}</span>
              </div>
            {/if}
            {#if displayWorkout.distanceMeters}
              <div class="figure">
                <span class="figure-m"
                  >{formatDistance(
                    displayWorkout.distanceMeters,
                    displayWorkout.sport,
                    settings,
                    fmt
                  )}</span
                >
                <span class="small muted">{m.drawer.distance}</span>
              </div>
            {/if}
            {#if displayWorkout.primaryZone}
              <div class="figure zone">
                <span class="zone-value"
                  >{getZoneInfo(displayWorkout.sport, displayWorkout.primaryZone, settings)}</span
                >
                <span class="small muted">{m.drawer.zone}</span>
              </div>
            {/if}
          </div>
        {/if}

        {#if profile.length > 1}
          <div>
            <div class="profile" role="img" aria-label={m.drawer.profile(profileMinutes)}>
              {#each profile as step, i (i)}
                <span class="step {step.zone}" style:flex-grow={step.seconds}></span>
              {/each}
            </div>
            <div class="profile-legend num">
              <span>0</span><span>{Math.round(profileMinutes / 2)} min</span><span
                >{profileMinutes} min</span
              >
            </div>
          </div>
        {/if}

        {#if displayWorkout.description}
          <p class="description">{displayWorkout.description}</p>
        {/if}

        {#if displayWorkout.humanReadable}
          <section>
            <h3 class="title-s">{m.drawer.steps}</h3>
            <p class="steps">{displayWorkout.humanReadable.replace(/\\n/g, "\n")}</p>
          </section>
        {/if}

        {#if recordedActivities.length > 0}
          <section>
            <h3 class="title-s">{m.drawer.recorded}</h3>
            {#each recordedActivities as activity (activity.id)}
              {@const p = activityParts(activity, settings, fmt)}
              <div class="recorded">
                <span>{activity.name ?? activity.sportType}</span>
                <span class="muted num">{m.session.summary(p.distance, p.time, p.heartrate)}</span>
              </div>
              <ActivityAnalysis {activity} {settings} />
            {/each}
          </section>
        {/if}

        {#if workout}
          <section class="feedback">
            <h3 class="title-s">{m.drawer.howDidItGo}</h3>

            {#if editingFeedback}
              <div class="field">
                <span>{m.drawer.effort}</span>
                <div class="rpe" role="radiogroup" aria-label={m.drawer.effortScale}>
                  {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as value (value)}
                    <button
                      type="button"
                      class="chip"
                      role="radio"
                      aria-checked={fbRpe === value}
                      class:on={fbRpe === value}
                      onclick={() => (fbRpe = fbRpe === value ? null : value)}>{value}</button
                    >
                  {/each}
                </div>
                <div class="rpe-hint field-hint">
                  <span>{m.drawer.veryEasy}</span><span>{m.drawer.allOut}</span>
                </div>
              </div>

              <div class="field">
                <span>{m.drawer.feeling}</span>
                <div class="chips">
                  {#each FEELINGS as value (value)}
                    <button
                      type="button"
                      class="chip"
                      aria-pressed={fbFeeling === value}
                      onclick={() => (fbFeeling = fbFeeling === value ? null : value)}
                    >
                      {m.drawer.feelings[value]}
                    </button>
                  {/each}
                </div>
              </div>

              <label class="check">
                <input type="checkbox" bind:checked={fbPain} />
                {m.drawer.pain}
              </label>
              {#if fbPain}
                <input
                  type="text"
                  class="input"
                  maxlength="500"
                  aria-label={m.drawer.pain}
                  placeholder={m.drawer.painPlaceholder}
                  bind:value={fbPainNotes}
                />
              {/if}

              <textarea
                class="input"
                rows="3"
                maxlength="2000"
                aria-label={m.drawer.howDidItGo}
                placeholder={m.drawer.notesPlaceholder}
                bind:value={fbNotes}
              ></textarea>

              {#if fbError}
                <p class="notice error">{fbError}</p>
              {/if}

              <div class="row">
                <button
                  class="btn btn-primary"
                  onclick={saveFeedback}
                  disabled={fbSaving || feedbackIsEmpty}
                >
                  {fbSaving ? m.common.saving : m.common.save}
                </button>
                <button class="btn btn-ghost" onclick={() => (editingFeedback = false)}
                  >{m.common.cancel}</button
                >
                {#if feedback}
                  <button
                    class="btn btn-ghost btn-danger"
                    onclick={removeFeedback}
                    disabled={fbSaving}
                  >
                    {m.common.remove}
                  </button>
                {/if}
              </div>
              {#if !displayWorkout.completed}
                <p class="small muted">{m.drawer.saveAlsoMarks}</p>
              {/if}
            {:else if feedback}
              <div class="chips">
                {#if feedback.rpe}
                  <span class="pill">{m.week.rpe(String(feedback.rpe))}</span>
                {/if}
                {#if feedback.feeling}
                  <span class="pill">{m.drawer.feelings[feedback.feeling]}</span>
                {/if}
                {#if feedback.pain}
                  <span class="pill pain">{m.drawer.painPill(feedback.painNotes ?? null)}</span>
                {/if}
              </div>
              {#if feedback.notes}
                <p class="description">{feedback.notes}</p>
              {/if}
              <div>
                <button class="btn btn-sm" onclick={startFeedbackEdit}>{m.common.edit}</button>
              </div>
            {:else}
              <div>
                <button class="btn btn-sm" onclick={startFeedbackEdit}
                  >{m.drawer.logHowItWent}</button
                >
              </div>
            {/if}
          </section>
        {/if}
      {:else}
        <div class="form">
          <div class="pair">
            <label class="field" for="edit-sport">
              {m.drawer.sport}
              <select id="edit-sport" class="input" bind:value={editSport}>
                {#each sports as s (s)}
                  <option value={s}>{m.sport[s] ?? s}</option>
                {/each}
              </select>
            </label>
            <label class="field" for="edit-type">
              {m.drawer.type}
              <select id="edit-type" class="input" bind:value={editType}>
                {#each workoutTypes as t (t)}
                  <option value={t}>{m.workoutType[t] ?? t}</option>
                {/each}
              </select>
            </label>
          </div>
          <label class="field" for="edit-name">
            {m.drawer.name}
            <input
              id="edit-name"
              type="text"
              class="input"
              bind:value={editName}
              placeholder={m.drawer.namePlaceholder}
            />
          </label>
          <label class="field" for="edit-description">
            {m.drawer.description}
            <textarea
              id="edit-description"
              class="input"
              bind:value={editDescription}
              placeholder={m.drawer.descriptionPlaceholder}
              rows="2"
            ></textarea>
          </label>
          <div class="pair">
            <label class="field" for="edit-duration">
              {m.drawer.durationMinutes}
              <input
                id="edit-duration"
                type="number"
                class="input"
                bind:value={editDuration}
                placeholder="60"
              />
            </label>
            <label class="field" for="edit-distance">
              {m.drawer.distanceMeters}
              <input
                id="edit-distance"
                type="number"
                class="input"
                bind:value={editDistance}
                placeholder="10000"
              />
            </label>
          </div>
          <label class="field" for="edit-zone">
            {m.drawer.zone}
            <input
              id="edit-zone"
              type="text"
              class="input"
              bind:value={editZone}
              placeholder={m.drawer.zonePlaceholder}
            />
          </label>
          <label class="field" for="edit-structure">
            {m.drawer.structure}
            <textarea
              id="edit-structure"
              class="input"
              bind:value={editStructure}
              placeholder={m.drawer.structurePlaceholder}
              rows="5"
            ></textarea>
          </label>
        </div>
      {/if}
    </div>

    {#if currentMode === "view" && showMovePanel}
      <div class="move">
        <label class="field" for="move-date">
          {m.drawer.moveTo}
          <input
            id="move-date"
            type="date"
            class="input"
            min={planDateRange.min}
            max={planDateRange.max}
            bind:value={moveDate}
          />
        </label>
        <button
          class="btn btn-primary"
          disabled={!moveDate || moveDate === day.date}
          onclick={() => onMove(displayWorkout.id, moveDate)}
        >
          {m.drawer.move}
        </button>
      </div>
    {/if}

    {#if showDeleteConfirm}
      <div class="confirm notice warn" role="alertdialog" aria-label={m.drawer.deleteConfirm}>
        <span>{m.drawer.deleteConfirm}</span>
        <div class="row">
          <button class="btn btn-sm btn-danger" onclick={handleDelete}>{m.common.delete}</button>
          <button class="btn btn-ghost btn-sm" onclick={() => (showDeleteConfirm = false)}
            >{m.common.cancel}</button
          >
        </div>
      </div>
    {/if}

    <footer>
      {#if currentMode === "view"}
        {#if exportStatus}
          <p class="status small" class:error={exportStatus.isError} role="status">
            {exportStatus.message}
          </p>
        {/if}
        <div class="row wrap">
          <button
            class="btn"
            class:btn-primary={!displayWorkout.completed}
            onclick={() => onToggleComplete(displayWorkout.id)}
          >
            {displayWorkout.completed ? m.drawer.markUndone : m.drawer.markDone}
          </button>
          {#if workout && isGarminConnectSupported(displayWorkout.sport)}
            <button class="btn" onclick={handleSendToGarmin} disabled={garminSending}>
              <svg viewBox="0 0 24 24" aria-hidden="true"
                ><circle cx="12" cy="12" r="6" /><path
                  d="M12 10v2l1 1M16 7.5 15.4 3.7A2 2 0 0 0 13.4 2h-2.8a2 2 0 0 0-2 1.7L8 7.5M8 16.5l.6 3.8a2 2 0 0 0 2 1.7h2.8a2 2 0 0 0 2-1.7l.6-3.8"
                /></svg
              >
              {m.drawer.sendToWatch}
            </button>
          {/if}
        </div>
        <div class="row wrap secondary">
          <button class="btn btn-ghost btn-sm" onclick={startEdit}>{m.common.edit}</button>
          <button
            class="btn btn-ghost btn-sm"
            aria-expanded={showMovePanel}
            onclick={() => (showMovePanel = !showMovePanel)}>{m.drawer.move}</button
          >
          {#if canExport}
            <div class="export">
              <button
                class="btn btn-ghost btn-sm"
                aria-expanded={showExportMenu}
                onclick={() => (showExportMenu = !showExportMenu)}>{m.drawer.export}</button
              >
              {#if showExportMenu}
                <div class="menu">
                  {#if isZwoSupported(displayWorkout.sport)}
                    <button onclick={() => handleExport("zwo")}
                      ><b>{m.drawer.exportZwo}</b><span>{m.drawer.exportZwoHint}</span></button
                    >
                  {/if}
                  {#if isFitSupported(displayWorkout.sport)}
                    <button onclick={() => handleExport("fit")}
                      ><b>{m.drawer.exportFit}</b><span>{m.drawer.exportFitHint}</span></button
                    >
                  {/if}
                  {#if isErgSupported(displayWorkout.sport)}
                    <button onclick={() => handleExport("mrc")}
                      ><b>{m.drawer.exportMrc}</b><span>{m.drawer.exportMrcHint}</span></button
                    >
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
          <button class="btn btn-ghost btn-sm btn-danger" onclick={() => (showDeleteConfirm = true)}
            >{m.common.delete}</button
          >
        </div>
      {:else}
        <div class="row">
          <button class="btn btn-primary" onclick={handleSave} disabled={!editName}>
            {currentMode === "create" ? m.drawer.add : m.drawer.saveChanges}
          </button>
          <button class="btn btn-ghost" onclick={cancelEdit}>{m.common.cancel}</button>
        </div>
      {/if}
    </footer>
  </div>
</div>

<style>
  /* Header and footer keep their height; only the middle scrolls. */
  header,
  footer {
    flex-shrink: 0;
  }
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: flex-end;
    background: rgba(15, 17, 21, 0.32);
  }
  .drawer {
    display: flex;
    flex-direction: column;
    width: min(600px, 100vw);
    height: 100%;
    background: var(--sheet);
    box-shadow: var(--shadow-float);
    animation: slide-in var(--transition-normal) ease-out;
  }
  @keyframes slide-in {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-8) var(--space-4);
  }
  header svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .first-cap::first-letter {
    text-transform: uppercase;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-2) var(--space-8) var(--space-8);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-8);
  }
  .figure {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .zone-value {
    font-size: 16px;
    line-height: 32px;
    font-weight: 650;
  }
  .profile {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 72px;
    padding: var(--space-2);
    border-radius: var(--radius-s);
    background: var(--sunk);
  }
  .step {
    flex-basis: 0;
    min-width: 3px;
    border-radius: 2px 2px 0 0;
    background: var(--z2);
  }
  .step.z1 {
    height: 20%;
    background: var(--z1);
  }
  .step.z2 {
    height: 38%;
  }
  .step.z3 {
    height: 58%;
    background: var(--z3);
  }
  .step.z4 {
    height: 78%;
    background: var(--z4);
  }
  .step.z5 {
    height: 100%;
    background: var(--z5);
  }
  .profile-legend {
    display: flex;
    justify-content: space-between;
    margin-top: var(--space-1);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .description {
    max-width: 65ch;
  }
  .steps {
    max-width: 65ch;
    white-space: pre-wrap;
  }
  .recorded {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-1) var(--space-4);
    font-weight: 600;
  }
  .rpe {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: var(--space-1);
  }
  .rpe .chip {
    padding: 0;
  }
  .rpe-hint {
    display: flex;
    justify-content: space-between;
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 560;
  }
  .pill {
    padding: 4px var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--sunk);
    font-size: 13px;
    font-weight: 560;
  }
  .pill.pain {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .row.wrap {
    flex-wrap: wrap;
  }
  .secondary {
    gap: var(--space-1);
    margin-left: calc(-1 * var(--space-3));
  }
  .move {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-8);
    border-top: 1px solid var(--line);
  }
  .confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0 var(--space-8) var(--space-4);
  }
  footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-8) calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--line);
  }
  footer svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .status {
    color: var(--ink-muted);
  }
  .status.error {
    color: var(--danger);
  }
  .export {
    position: relative;
  }
  .menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + var(--space-1));
    z-index: 2;
    display: flex;
    flex-direction: column;
    min-width: 240px;
    padding: var(--space-1);
    border-radius: var(--radius-m);
    background: var(--sheet);
    box-shadow: var(--shadow-float);
  }
  .menu button {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-s);
    background: none;
    text-align: left;
    font: inherit;
  }
  .menu button:hover {
    background: var(--sunk);
  }
  .menu span {
    font-size: 12px;
    color: var(--ink-muted);
  }

  @media (max-width: 800px) {
    .drawer {
      width: 100vw;
    }
    header,
    .body,
    footer,
    .move {
      padding-left: var(--space-4);
      padding-right: var(--space-4);
    }
    .confirm {
      margin: 0 var(--space-4) var(--space-4);
    }
  }
</style>
