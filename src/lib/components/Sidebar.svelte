<script lang="ts">
  import { base } from "$app/paths";
  import type { TrainingPlan, Sport } from "../../schema/training-plan.js";
  import { formatEventDate, getDaysToEvent, getSportIcon, getTodayISO } from "../utils.js";
  import type { RacePrediction as Prediction } from "../racePrediction.js";
  import type { Settings } from "../settings.js";
  import Logo from "./Logo.svelte";
  import RacePrediction from "./RacePrediction.svelte";

  interface Props {
    plan: TrainingPlan;
    filters: { sport: string; status: string };
    onFilterChange: (filters: { sport: string; status: string }) => void;
    onSettingsClick: () => void;
    prediction: Prediction | null;
    settings: Settings;
  }

  let { plan, filters, onFilterChange, onSettingsClick, prediction, settings }: Props = $props();

  const stats = $derived.by(() => {
    let totalWorkouts = 0;
    let completedCount = 0;
    let totalMinutes = 0;
    const sportHours: Record<string, number> = {
      swim: 0,
      bike: 0,
      run: 0,
      strength: 0,
      brick: 0,
      race: 0,
    };

    plan.weeks?.forEach((week) => {
      week.days?.forEach((day) => {
        day.workouts?.forEach((w) => {
          if (w.sport !== "rest") {
            totalWorkouts++;
            if (w.completed) completedCount++;
            if (w.durationMinutes) {
              totalMinutes += w.durationMinutes;
              if (sportHours[w.sport] !== undefined) {
                sportHours[w.sport] += w.durationMinutes / 60;
              }
            }
          }
        });
      });
    });

    return {
      totalWorkouts,
      completedCount,
      totalHours: Math.round(totalMinutes / 60),
      sportHours,
    };
  });

  // The week holding today, or null before the plan starts / after it ends.
  const currentWeek = $derived.by(() => {
    const today = getTodayISO();
    return plan.weeks?.find((w) => w.startDate <= today && today <= w.endDate) ?? null;
  });
  // How far through the plan's calendar today is.
  const elapsed = $derived.by(() => {
    const start = Date.parse(plan.meta?.planStartDate ?? "");
    const end = Date.parse(plan.meta?.eventDate ?? "");
    if (!start || !end || end <= start) return 0;
    return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
  });
  const daysToEvent = $derived(getDaysToEvent(plan.meta?.eventDate ?? ""));

  const availableSports = $derived(
    Object.entries(stats.sportHours)
      .filter(([, h]) => h > 0)
      .map(([sport]) => sport)
  );

  function toggleSportFilter(sport: string) {
    onFilterChange({ ...filters, sport: filters.sport === sport ? "all" : sport });
  }

  // Phone layout only: the full sidebar becomes a drawer behind the compact
  // top bar below. On desktop the sidebar is always shown and this stays false.
  let drawerOpen = $state(false);

  function openSettings() {
    drawerOpen = false;
    onSettingsClick();
  }

  const activeFilterCount = $derived(
    (filters.sport !== "all" ? 1 : 0) + (filters.status !== "all" ? 1 : 0)
  );
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (drawerOpen = false)} />

<header class="mobile-bar">
  <a class="mobile-back" href="{base}/" aria-label="All plans"><Logo size={22} /></a>
  <div class="mobile-title">
    <div class="mobile-event">{plan.meta?.event ?? "Training Plan"}</div>
    <div class="mobile-meta">{formatEventDate(plan.meta?.eventDate ?? "")}</div>
  </div>
  <button
    class="mobile-menu-btn"
    onclick={() => (drawerOpen = true)}
    aria-label="Plan details and filters"
    aria-expanded={drawerOpen}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
    {#if activeFilterCount > 0}
      <span class="filter-dot" aria-label="{activeFilterCount} active filter(s)"></span>
    {/if}
  </button>
</header>

{#if drawerOpen}
  <button class="drawer-backdrop" aria-label="Close" onclick={() => (drawerOpen = false)}></button>
{/if}

<aside class="sidebar" class:open={drawerOpen}>
  <div class="sidebar-top">
    <a class="home-link" href="{base}/" aria-label="All plans"><Logo size={24} /></a>
    <button class="drawer-close" onclick={() => (drawerOpen = false)} aria-label="Close">×</button>
  </div>

  <div class="event-header">
    <h1 class="event-name">{plan.meta?.event ?? "Training Plan"}</h1>
    <div class="event-date">{formatEventDate(plan.meta?.eventDate ?? "")}</div>
    <div class="athlete-name">{plan.meta?.athlete ?? "Athlete"}</div>
  </div>

  <div class="countdown">
    <div class="countdown-row">
      <div>
        <span class="countdown-value num">{Math.max(0, daysToEvent)}</span>
        <span class="countdown-unit">{daysToEvent === 1 ? "day" : "days"} to race day</span>
      </div>
      {#if currentWeek}
        <span class="countdown-week num">
          Week {currentWeek.weekNumber}/{plan.meta?.totalWeeks ?? plan.weeks.length}
        </span>
      {/if}
    </div>
    <div class="countdown-bar" aria-hidden="true">
      <span style:width="{elapsed * 100}%"></span>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value num">{plan.meta?.totalWeeks ?? 0}</div>
      <div class="stat-label">Weeks</div>
    </div>
    <div class="stat-card">
      <div class="stat-value num">{stats.totalHours}</div>
      <div class="stat-label">Hours</div>
    </div>
    <div class="stat-card">
      <div class="stat-value num">{stats.completedCount}<small>/{stats.totalWorkouts}</small></div>
      <div class="stat-label">Done</div>
    </div>
  </div>

  {#if prediction}
    <RacePrediction {prediction} {settings} />
  {/if}

  <button class="settings-btn" onclick={openSettings}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
    Settings
  </button>

  <div class="sport-stats">
    <div class="sport-stats-header">
      <h3>Filter by Sport</h3>
      {#if filters.sport !== "all"}
        <button class="clear-filter" onclick={() => onFilterChange({ ...filters, sport: "all" })}>
          Clear
        </button>
      {/if}
    </div>
    {#each availableSports as sport (sport)}
      <button
        class="sport-stat {sport}"
        class:active={filters.sport === sport}
        onclick={() => toggleSportFilter(sport)}
      >
        <div class="sport-icon {sport}">{getSportIcon(sport as Sport)}</div>
        <div class="sport-info">
          <div class="sport-name">{sport.charAt(0).toUpperCase() + sport.slice(1)}</div>
          <div class="sport-hours">{stats.sportHours[sport].toFixed(1)} hours</div>
        </div>
        {#if filters.sport === sport}
          <div class="check-icon">✓</div>
        {/if}
      </button>
    {/each}
  </div>

  <div class="filters-section">
    <h3>Filter by Status</h3>
    <div class="filter-group">
      {#each [["all", "All"], ["pending", "Pending"], ["completed", "Completed"]] as [value, label] (value)}
        <button
          class="filter-chip"
          class:active={filters.status === value}
          onclick={() => onFilterChange({ ...filters, status: value })}
        >
          {label}
        </button>
      {/each}
    </div>
  </div>
</aside>

<style>
  .sidebar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.25rem;
  }

  .home-link {
    display: inline-flex;
    text-decoration: none;
  }

  .drawer-close,
  .mobile-bar,
  .drawer-backdrop {
    display: none;
  }

  .sidebar {
    width: var(--sidebar-width);
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-subtle);
    padding: 1.5rem 1.25rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .event-header {
    padding-top: 0.5rem;
  }

  .event-name {
    font-size: 1.55rem;
    font-weight: 650;
    margin-bottom: 0.35rem;
  }

  .event-date {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .athlete-name {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.15rem;
  }

  .countdown {
    padding: 1rem 1.1rem 1.1rem;
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
  }

  .countdown-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .countdown-value {
    display: block;
    font-size: 2.6rem;
    font-weight: 650;
    line-height: 1;
    color: var(--accent);
  }

  .countdown-unit {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .countdown-week {
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: var(--bg-elevated);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .countdown-bar {
    height: 4px;
    margin-top: 1rem;
    border-radius: 2px;
    background: var(--bg-elevated);
    overflow: hidden;
  }

  .countdown-bar span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .stat-card {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.7rem 0.5rem;
    text-align: center;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .stat-value small {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .stat-label {
    font-size: 0.68rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 0.15rem;
  }

  .settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.7rem 1rem;
    border-radius: 10px;
    border: 1px solid var(--border-medium);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 500;
  }

  .settings-btn svg {
    width: 16px;
    height: 16px;
  }

  .settings-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .sport-stats h3,
  .filters-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .sport-stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .clear-filter {
    font-size: 0.7rem;
    color: var(--accent);
    background: none;
    border: none;
  }

  .sport-stat {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.6rem;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-primary);
    margin-bottom: 0.3rem;
    text-align: left;
  }

  .sport-stat:hover {
    background: var(--bg-tertiary);
  }

  .sport-stat.active {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
  }

  .sport-icon {
    font-size: 1.1rem;
  }

  .sport-info {
    flex: 1;
  }

  .sport-name {
    font-size: 0.85rem;
    font-weight: 500;
  }

  .sport-hours {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .check-icon {
    color: var(--accent);
  }

  .filter-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-chip {
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--border-medium);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8rem;
  }

  .filter-chip.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
  }

  /* Phone: compact sticky top bar; the full sidebar slides in as a drawer. */
  @media (max-width: 800px) {
    .mobile-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      position: sticky;
      top: 0;
      z-index: 50;
      height: 56px;
      padding: 0 0.5rem;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-subtle);
    }

    .mobile-back {
      flex-shrink: 0;
      width: 64px;
      height: 44px;
      display: flex;
      align-items: center;
      padding-left: 0.5rem;
      text-decoration: none;
    }

    .mobile-menu-btn {
      position: relative;
      flex-shrink: 0;
      width: 64px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 0.5rem;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--text-secondary);
    }

    .mobile-menu-btn svg {
      width: 22px;
      height: 22px;
    }

    .filter-dot {
      position: absolute;
      top: 9px;
      right: 9px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
    }

    .mobile-title {
      flex: 1;
      min-width: 0;
      text-align: center;
    }

    .mobile-event {
      font-weight: 700;
      font-size: 1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-meta {
      font-family: var(--font-display);
      font-variant-numeric: tabular-nums;
      font-size: 0.72rem;
      color: var(--text-secondary);
    }

    .drawer-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 90;
      border: none;
      background: rgba(0, 0, 0, 0.6);
    }

    .sidebar {
      z-index: 100;
      width: min(88vw, 360px);
      height: 100dvh;
      padding: 1rem 1.25rem 2rem;
      gap: 1.5rem;
      transform: translateX(-100%);
      transition: transform var(--transition-normal);
      visibility: hidden;
    }

    .sidebar.open {
      transform: translateX(0);
      visibility: visible;
    }

    .drawer-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      margin-right: -0.5rem;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 1.6rem;
    }

    .home-link {
      padding: 0.6rem 0;
    }

    .sport-stat {
      padding: 0.75rem 0.6rem;
    }

    .filter-chip {
      padding: 0.55rem 1rem;
      font-size: 0.85rem;
    }

    .settings-btn {
      padding: 0.85rem 1rem;
    }
  }
</style>
