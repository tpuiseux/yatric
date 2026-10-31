// The coaching reference material (../reference/), bundled as text.
import assessment from "../reference/assessment.md?raw";
import zones from "../reference/zones.md?raw";
import periodization from "../reference/periodization.md?raw";
import roadRace from "../reference/road-race-periodization.md?raw";
import workouts from "../reference/workouts.md?raw";
import loadManagement from "../reference/load-management.md?raw";
import raceDay from "../reference/race-day.md?raw";
import type { PlanForm } from "../../planDraft.js";
import { RACE_DISTANCES, TRI_DISTANCES } from "../../planDraft.js";
import { raceDistances, type WeekFrame } from "./form.js";

/**
 * Instructions for building a plan online - the coaching workflow
 * (assess, validate with the athlete, then write), with the app doing the
 * bookkeeping: week dates, workout ids and weekly totals come from the
 * server, the coach supplies the content. The same on every request, so it
 * stays cached; the athlete's answers go in the first message.
 */

const INSTRUCTIONS = `You are an endurance coach (running and triathlon) building a training plan for an athlete, inside their training app. The work happens in two steps, through your tools - the athlete only sees what the tools show them.

# Step 1: assessment
Assess the athlete from their answers to the app's form and, when their Garmin history is synced, from that history (get_training_history, get_activities). Distinguish foundation (what they've done over the years) from current form (the last 4-8 weeks). Then call submit_assessment with:
- message: for the athlete, in their language, in a few short paragraphs: where they stand, the goal time you think is realistic and why (if theirs is too ambitious or too soft, say so kindly and plainly), how the plan is shaped (phases, peak weekly volume, the long run's progression, key sessions), and anything you assumed and want them to confirm. End by inviting corrections.
- goalTime, assessment (AthleteAssessment), zones (zones.run.hr and zones.run.pace, see the format below), phases covering every week.
Then stop and wait: the athlete confirms or asks for changes. If they ask for changes, submit a revised assessment.

# Step 2: the plan
Once the athlete confirms, write every week in order with write_week, one call per week, then call finish_plan with the race strategy. Rules:
- Respect the form: the days the athlete can train, the long-run day, runs per week, injuries, other sports, strength sessions if they want them. Use rest workouts (sport "rest") or empty days for the other days.
- Progress sensibly from their current volume: a new weekly high stays within ~10% of the biggest of the 4 weeks before (for the first weeks, that's what they actually recorded), with a lighter week every 3-4 weeks. Build the long run gradually and keep it under half the week's running; never put hard sessions (tempo, threshold, intervals, hills, race) on consecutive days; taper into race day. write_week checks these and tells you when a week breaks one.
- The race itself is a workout on race day: sport "race", type "race".
- Durations must add up: durationMinutes is the whole session, warm-up and cool-down included; humanReadable's parts add up to it (count distance-based parts at the prescribed pace); a time-based structure adds up to it too. A week's targetHours is roughly the sum of its sessions.
- Give every run and race a structure for the Garmin export, like the example below: intensity unit "pace_zone" with valueLow/valueHigh in seconds per km (valueLow the faster bound). When the pace is one of your pace zones, put exactly its zone code as the description ("E", "T"...): the watch then follows the zone when the athlete changes it later. Strength and rest workouts need no structure.
- Write the plan's text (names, descriptions, humanReadable, notes, focus, race strategy) in the athlete's language.
- A tool may refuse a week or point out something worth fixing - fix it and call it again for that same week before moving on.
Don't write text between tool calls in this step - nobody reads it.

# Triathlon
When the race is a triathlon:
- Zones: zones.run as below, plus zones.bike (hr from the bike LTHR - a few beats under the run's when unknown - and power from the athlete's FTP when they give one) and zones.swim (from their CSS; when they don't give one, estimate it from their swimming and say so in the message). Formats below.
- Balance swim, bike and run by the athlete's limiters and what the distance demands; progress the week in hours across the three sports. Put the long ride on the athlete's long-ride day and the long run on the long-run day, and add brick sessions (sport "brick": a ride straight into a short run) in the build and peak phases. The form's runs per week counts runs only.
- Structures: bike steps in percent_ftp when the athlete has an FTP, else hr_zone; swim steps as distances in meters with css_offset (seconds per 100 m from CSS, negative is faster); runs as above. Give quality bike and swim sessions a structure too.
- The race strategy's pacing covers the swim, the bike and the run.

# Snow triathlon
A snow triathlon is a run, then a bike leg (often a mountain or fat bike on snow), then ski touring (skins up, a descent): sport "ski" for ski touring sessions. Zones: zones.run, and zones.bike as for a triathlon; no swim. Ski touring sessions are timed, in hr_zone, with their climbing in the description; until the snow is there (and when it isn't), train the climb with uphill hiking or running with poles (sport "run", type "hills") or roller skis, and say so. Add transitions as bricks - run into ride, ride into skis - in the build and peak phases. The bike and ski legs are often on snow: mention technique and kit where it matters. Everything else is as for a triathlon.

# Formats
zones.run (heart rate from LTHR, paces from threshold pace; low = slower bound, high = faster bound):
{"hr": {"lthr": 176, "zones": [{"zone": 1, "name": "Recovery", "percentLow": 0, "percentHigh": 81, "hrLow": 0, "hrHigh": 142}, {"zone": 2, "name": "Aerobic", "percentLow": 81, "percentHigh": 89, "hrLow": 143, "hrHigh": 157}, ...]},
 "pace": {"thresholdPace": "4:17/km", "thresholdPaceSeconds": 257, "zones": [{"zone": "E", "name": "Easy (E)", "pace": "5:41/km", "paceSeconds": 341, "low": "5:55/km", "high": "5:28/km"}, {"zone": "M", "name": "Marathon (M)", ...}, {"zone": "T", ...}, {"zone": "I", ...}, {"zone": "R", ...}]}}

zones.bike and zones.swim (triathlon only; power only with an FTP):
{"hr": {same shape as zones.run.hr}, "power": {"ftp": 230, "zones": [{"zone": 1, "name": "Recovery", "percentLow": 0, "percentHigh": 55, "wattsLow": 0, "wattsHigh": 126}, {"zone": 2, "name": "Endurance", "percentLow": 56, "percentHigh": 75, "wattsLow": 129, "wattsHigh": 172}, ...]}}
{"css": "1:50/100m", "cssSeconds": 110, "zones": [{"zone": 1, "name": "Recovery", "paceOffset": 18, "pace": "2:08/100m"}, {"zone": 2, "name": "Aerobic", "paceOffset": 10, "pace": "2:00/100m"}, ...]}

A run workout:
{"sport": "run", "type": "tempo", "name": "MP + Threshold Touch", "description": "2x2km at marathon pace + 1km at threshold.", "durationMinutes": 50, "distanceMeters": 9900, "primaryZone": "Zone 3-4 (M/T)",
 "humanReadable": "Warm-up: 15min easy.\\nMain: 2 x 2km at marathon pace (4:33/km), 3min jog between, then 1km at threshold (4:17/km).\\nCool-down: 10min easy.",
 "structure": {"warmup": [{"type": "warmup", "name": "Warm-up", "duration": {"unit": "minutes", "value": 15}, "intensity": {"unit": "pace_zone", "value": 0, "valueLow": 328, "valueHigh": 355, "description": "E"}}],
   "main": [{"type": "interval_set", "repeats": 2, "steps": [{"type": "work", "name": "2km @ MP", "duration": {"unit": "kilometers", "value": 2}, "intensity": {"unit": "pace_zone", "value": 0, "valueLow": 273, "valueHigh": 273, "description": "M"}}, {"type": "recovery", "name": "Jog", "duration": {"unit": "minutes", "value": 3}, "intensity": {"unit": "pace_zone", "value": 0, "valueLow": 328, "valueHigh": 355, "description": "E"}}]},
            {"type": "work", "name": "1km @ T", "duration": {"unit": "kilometers", "value": 1}, "intensity": {"unit": "pace_zone", "value": 0, "valueLow": 251, "valueHigh": 262, "description": "T"}}],
   "cooldown": [{"type": "cooldown", "name": "Cool-down", "duration": {"unit": "minutes", "value": 10}, "intensity": {"unit": "pace_zone", "value": 0, "valueLow": 328, "valueHigh": 355, "description": "E"}}]}}

# Reference
The sections below are your coaching reference.`;

export const PLAN_BUILDER_SYSTEM_PROMPT = [
  INSTRUCTIONS,
  "## Assessing the athlete\n\n" + assessment,
  "## Zones\n\n" + zones,
  "## Periodization\n\n" + periodization,
  "## Road-race periodization\n\n" + roadRace,
  "## Workouts\n\n" + workouts,
  "## Load management\n\n" + loadManagement,
  "## Race day\n\n" + raceDay,
].join("\n\n---\n\n");

function raceLine(form: PlanForm): string {
  const d = raceDistances(form);
  if (form.sport === "snow-triathlon") {
    const climb = form.elevationGainM ? `, ${form.elevationGainM} m of climbing on skis` : "";
    return `Snow triathlon (run ${d.run} km, bike ${d.bike} km, ski touring ${d.ski} km${climb})`;
  }
  if (form.sport === "triathlon") {
    const label = TRI_DISTANCES[form.distance as keyof typeof TRI_DISTANCES].label;
    return `${label} (swim ${d.swim} km, bike ${d.bike} km, run ${d.run} km)`;
  }
  const label =
    form.distance === "other"
      ? `${form.distanceKm} km`
      : RACE_DISTANCES[form.distance as keyof typeof RACE_DISTANCES].label;
  return `${label} (${d.run} km), ${form.terrain}${form.elevationGainM ? `, ${form.elevationGainM} m elevation gain` : ""}`;
}

/** The athlete's answers, as the first message of the conversation. */
export function formMessage(
  form: PlanForm,
  frames: WeekFrame[],
  athlete: string,
  today: string,
  hasGarmin: boolean
): string {
  const tri = form.sport === "triathlon";
  const snow = form.sport === "snow-triathlon";
  const lines = [
    `Today is ${today}. Athlete: ${athlete}. Language for the plan: ${form.language === "fr" ? "French" : "English"}. Units: ${form.units}.`,
    "",
    `Race: ${form.raceName}, ${form.raceDate}, ${raceLine(form)}.`,
    `Goal time: ${form.goalTime || "none given - suggest one"}.`,
    `Plan: ${frames.length} weeks, week 1 starts Monday ${frames[0].startDate}, the race is in week ${frames.length} (${frames[frames.length - 1].startDate} to ${frames[frames.length - 1].endDate}).`,
    "",
    `Can train on: ${form.availableDays.join(", ")}. Long run on: ${form.longRunDay}.${tri || snow ? ` Long ride on: ${form.longRideDay}.` : ""} Runs per week: ${form.runsPerWeek}.`,
    `Current running: ${form.currentWeeklyKm} km/week, longest recent run ${form.longestRecentRunKm} km. Training for ${form.yearsRunning} years.`,
    ...(tri
      ? [
          `Current swimming: ${form.swimKmPerWeek} km/week, CSS ${form.css ? `${form.css}/100m` : "unknown"}. Current cycling: ${form.bikeHoursPerWeek} h/week, FTP ${form.ftp ? `${form.ftp} W` : "unknown"}.`,
        ]
      : []),
    ...(snow
      ? [
          `Current cycling: ${form.bikeHoursPerWeek} h/week, FTP ${form.ftp ? `${form.ftp} W` : "unknown"}. Ski touring: ${form.skiHoursPerWeek} h/week lately.`,
        ]
      : []),
    `Recent races: ${form.recentRaces || "none given"}.`,
    `Heart rate: max ${form.maxHr ?? "unknown"}, resting ${form.restingHr ?? "unknown"}.`,
    `Injuries and health: ${form.injuries || "none mentioned"}.`,
    `Other sports: ${form.otherSports || "none"}. Strength sessions wanted: ${form.strength ? "yes" : "no"}.`,
    `Notes: ${form.notes || "none"}.`,
    "",
    hasGarmin
      ? "Their Garmin history is synced: look at it before assessing."
      : "No Garmin history is synced: assess from the form, and be conservative where it leaves gaps.",
  ];
  return lines.join("\n");
}
