const STORAGE_KEY = "perfect-day-state-v1";
const SOUND_STORAGE_KEY = "perfect-day-local-sounds-v1";
const PERFECT_DAY_TRACK = {
  previewUrl: "https://p.scdn.co/mp3-preview/15b6a2fb249d2fbba4f2f5aea63a2979392a228e.mp3"
};
const SAUNA_TRACK = {
  previewUrl: "https://p.scdn.co/mp3-preview/556c25e5364d689df48965702632cfa8c5053baa.mp3"
};
const PERIOD_FREQUENCIES = ["weekly", "monthly", "halfyear", "yearly"];
const HABIT_COLORS = ["#45a66b", "#e6b85c", "#ff776d", "#4f8fbf", "#9a72b5", "#28a7a1"];
const DEFAULT_FASTING = { targetHours: 12, active: false, startedAt: "" };
const SYNC_CONFIG = {
  url: "https://hwjyupnbybekckearloz.supabase.co",
  key: "sb_publishable_dtdIdtfFdTVYqkWGEVxVQA_XN2ZetBM",
  redirectUrl: "https://chillada.github.io/perfect-day/"
};

const defaultHabits = [
  { id: "meditation", name: "Meditation", frequency: "daily", type: "check", goal: 1, unit: "", enabled: true, order: 1 },
  { id: "breathwork", name: "Breathwork", frequency: "daily", type: "check", goal: 1, unit: "", enabled: true, order: 2 },
  { id: "cold-shower", name: "Cold shower", frequency: "daily", type: "check", goal: 1, unit: "", enabled: true, order: 3 },
  { id: "fast", name: "12 hour fast", frequency: "daily", type: "check", goal: 1, unit: "", enabled: true, order: 4 },
  { id: "sauna", name: "Sauna", frequency: "weekly", type: "check", goal: 1, unit: "", enabled: true, order: 5 },
  { id: "steps", name: "Steps", frequency: "weekly", type: "number", goal: 100000, unit: "steps", enabled: true, order: 6 }
];

const state = loadState();
const localSounds = loadLocalSounds();
let activeView = "today";
let syncClient = null;
let syncSession = null;
let syncStatus = "Sign in to sync";
let cloudSaveTimer = 0;
let applyingCloudState = false;
let activeAudio = null;

const icons = {
  today: '<svg viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M3.5 9.5h17M6 5h12a2.5 2.5 0 0 1 2.5 2.5V18A2.5 2.5 0 0 1 18 20.5H6A2.5 2.5 0 0 1 3.5 18V7.5A2.5 2.5 0 0 1 6 5Z"/><path d="m8.5 14 2.1 2.1 4.9-5.2"/></svg>',
  week: '<svg viewBox="0 0 24 24"><path d="M4 19V5M20 19V5M8 19V8M16 19V10M12 19V3"/></svg>',
  stats: '<svg viewBox="0 0 24 24"><path d="M4 19h16M7 16V9M12 16V5M17 16v-3"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4 4v6h6"/><path d="M20 11a8 8 0 1 0-2.3 5.7"/></svg>'
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.habits)) {
      return {
        habits: parsed.habits,
        entries: parsed.entries || {},
        createdAt: parsed.createdAt || todayKey(),
        fasting: normalizeFasting(parsed.fasting)
      };
    }
  } catch (error) {
    console.warn("Could not load Perfect Day data", error);
  }

  return {
    habits: defaultHabits,
    entries: {},
    createdAt: todayKey(),
    fasting: normalizeFasting()
  };
}

function normalizeFasting(fasting = {}) {
  const targetHours = Math.min(168, Math.max(1, Number(fasting.targetHours || DEFAULT_FASTING.targetHours)));
  const startedAt = typeof fasting.startedAt === "string" ? fasting.startedAt : "";
  const logs = fasting.logs && typeof fasting.logs === "object" ? fasting.logs : {};
  return {
    targetHours,
    active: Boolean(fasting.active && startedAt),
    startedAt,
    logs
  };
}

function loadLocalSounds() {
  try {
    return JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveLocalSounds() {
  localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(localSounds));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!applyingCloudState && syncSession) scheduleCloudSave();
}

function todayKey(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function toDateKey(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const year = copy.getFullYear();
  const month = String(copy.getMonth() + 1).padStart(2, "0");
  const day = String(copy.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(key, style = "long") {
  return dateFromKey(key).toLocaleDateString(undefined, {
    weekday: style === "short" ? "short" : "long",
    month: "short",
    day: "numeric"
  });
}

function weekStartKey(dateKey = todayKey()) {
  const date = dateFromKey(dateKey);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateKey(date);
}

function weekDates(dateKey = todayKey()) {
  const start = dateFromKey(weekStartKey(dateKey));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toDateKey(date);
  });
}

function periodDates(frequency, dateKey = todayKey()) {
  if (frequency === "daily") return [dateKey];
  if (frequency === "weekly") return weekDates(dateKey);

  const current = dateFromKey(dateKey);
  let start;
  let end;

  if (frequency === "monthly") {
    start = new Date(current.getFullYear(), current.getMonth(), 1);
    end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  } else if (frequency === "halfyear") {
    const startMonth = current.getMonth() < 6 ? 0 : 6;
    start = new Date(current.getFullYear(), startMonth, 1);
    end = new Date(current.getFullYear(), startMonth + 6, 0);
  } else {
    start = new Date(current.getFullYear(), 0, 1);
    end = new Date(current.getFullYear(), 11, 31);
  }

  const dates = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    dates.push(toDateKey(date));
  }
  return dates;
}

function frequencyLabel(frequency) {
  return {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    halfyear: "Every 6 months",
    yearly: "Yearly"
  }[frequency] || frequency;
}

function periodLabel(frequency, dateKey = todayKey()) {
  const dates = periodDates(frequency, dateKey);
  if (frequency === "weekly") return weekRangeLabel();
  if (frequency === "monthly") {
    return dateFromKey(dateKey).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const first = dateFromKey(dates[0]).toLocaleDateString(undefined, { month: "short" });
  const last = dateFromKey(dates[dates.length - 1]).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  return `${first} - ${last}`;
}

function orderedHabits(frequency) {
  return state.habits
    .filter((habit) => habit.frequency === frequency)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function activeHabits(frequency) {
  return orderedHabits(frequency).filter((habit) => habit.enabled);
}

function entryFor(dateKey) {
  state.entries[dateKey] ||= {};
  return state.entries[dateKey];
}

function getValue(dateKey, habitId) {
  const entry = state.entries[dateKey] || {};
  return entry[habitId] ?? 0;
}

function setValue(dateKey, habitId, value) {
  const habit = findHabit(habitId);
  const wasPerfect = isPerfectDay(dateKey);
  const wasComplete = habit ? isHabitComplete(habit, periodDates(habit.frequency, dateKey)) : false;
  entryFor(dateKey)[habitId] = value;
  saveState();
  const becamePerfect = !wasPerfect && isPerfectDay(dateKey);
  const becameComplete = habit && !wasComplete && isHabitComplete(habit, periodDates(habit.frequency, dateKey));
  render();
  if (becamePerfect && dateKey === todayKey()) {
    triggerCelebration();
  } else if (becameComplete && dateKey === todayKey()) {
    playHabitSound(habit);
  }
}

function isHabitComplete(habit, dateKeys) {
  if (habit.type === "check") {
    if (habit.frequency === "daily") return Boolean(getValue(dateKeys[0], habit.id));
    return dateKeys.some((dateKey) => Boolean(getValue(dateKey, habit.id)));
  }

  const total = dateKeys.reduce((sum, dateKey) => sum + Number(getValue(dateKey, habit.id) || 0), 0);
  return total >= Number(habit.goal || 0);
}

function isPerfectDay(dateKey) {
  const habits = activeHabits("daily");
  if (!habits.length) return false;
  return habits.every((habit) => isHabitComplete(habit, [dateKey]));
}

function dailyScore(dateKey = todayKey()) {
  const habits = activeHabits("daily");
  if (!habits.length) return { complete: 0, total: 0, percent: 0 };
  const complete = habits.filter((habit) => isHabitComplete(habit, [dateKey])).length;
  return { complete, total: habits.length, percent: Math.round((complete / habits.length) * 100) };
}

function weeklyCompletion(dateKey = todayKey()) {
  const dates = weekDates(dateKey);
  const habits = activeHabits("weekly");
  if (!habits.length) return { complete: 0, total: 0, percent: 0 };
  const complete = habits.filter((habit) => isHabitComplete(habit, dates)).length;
  return { complete, total: habits.length, percent: Math.round((complete / habits.length) * 100) };
}

function currentStreak() {
  let count = 0;
  for (let offset = 0; offset > -730; offset -= 1) {
    if (!isPerfectDay(todayKey(offset))) break;
    count += 1;
  }
  return count;
}

function neverMissTwiceStreak() {
  let streak = 0;
  let previousDayMissed = false;

  knownDateRange().forEach((dateKey) => {
    if (dateKey === todayKey() && !isPerfectDay(dateKey)) return;
    if (isPerfectDay(dateKey)) {
      streak += 1;
      previousDayMissed = false;
      return;
    }
    if (previousDayMissed) {
      streak = 0;
    } else {
      streak += 1;
    }
    previousDayMissed = true;
  });

  return streak;
}

function bestStreak() {
  const allDates = knownDateRange();
  let best = 0;
  let running = 0;
  allDates.forEach((dateKey) => {
    if (isPerfectDay(dateKey)) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  });
  return best;
}

function knownDateRange() {
  const startDate = dateFromKey(state.createdAt);
  const endDate = dateFromKey(todayKey());
  const dates = [];
  for (const date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    dates.push(toDateKey(date));
  }
  return dates;
}

function perfectDayCount() {
  return knownDateRange().filter(isPerfectDay).length;
}

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        ${brandMarkup()}
        ${navMarkup("side")}
      </aside>
      <main class="main-panel">
        <header class="topbar">
          ${brandMarkup()}
          <div class="date-pill today-score-pill">Today's Score · ${dailyScore().percent}%</div>
        </header>
        ${viewMarkup()}
      </main>
      <nav class="bottom-nav">${navMarkup("bottom")}</nav>
    </div>
  `;

  bindNav();
  bindView();
}

function brandMarkup() {
  return `
    <div class="brand">
      <img src="icons/perfect-day-yin.svg" alt="" />
      <div>
        <strong>Perfect Day</strong>
      </div>
    </div>
  `;
}

function navMarkup(prefix) {
  const items = [
    ["today", "Today"],
    ["stats", "Stats"],
    ["settings", "Settings"]
  ];

  return items
    .map(([view, label]) => {
      const active = activeView === view ? "active" : "";
      return `<button class="nav-button ${active}" data-view="${view}" aria-label="${label}" title="${label}">${icons[view]}<span>${label}</span></button>`;
    })
    .join("");
}

function viewMarkup() {
  if (activeView === "stats") return statsView();
  if (activeView === "settings") return settingsView();
  return todayView();
}

function todayView() {
  const dateKey = todayKey();
  const dailyHabits = activeHabits("daily");
  const perfect = isPerfectDay(dateKey);
  const completed = dailyHabits.filter((habit) => isHabitComplete(habit, [dateKey])).length;
  const percent = dailyHabits.length ? Math.round((completed / dailyHabits.length) * 100) : 0;

  return `
    ${fastingPanelMarkup()}

    <section class="hero-band">
      <div>
        <p class="eyebrow">Today</p>
        <h1>${perfect ? "Another Brick Laid." : "Keep your promise."}</h1>
        <p>${completed} of ${dailyHabits.length} daily targets complete</p>
      </div>
      <div class="score-ring ${perfect ? "perfect" : ""}" style="--score:${percent}" aria-label="${percent}% complete">
        <span class="score-yin-yang" aria-hidden="true">
          <img src="icons/perfect-day-yin.svg" alt="" />
        </span>
      </div>
    </section>

    <section class="content-grid">
      <div class="panel">
        <div class="panel-heading">
          <h2>Daily targets</h2>
          <span>${formatDate(dateKey, "short")}</span>
        </div>
        <div class="habit-list">
          ${
            dailyHabits.length
              ? dailyHabits.map((habit) => dailyHabitMarkup(habit, dateKey)).join("")
              : `<p class="empty">No active daily targets.</p>`
          }
        </div>
      </div>

      <div class="panel accent-panel long-term-panel">
        <div class="panel-heading">
          <h2>Longer-term targets</h2>
        </div>
        ${longTermTargetsMarkup(dateKey)}
      </div>
    </section>
  `;
}

function fastingPanelMarkup() {
  const fast = fastingStatus();
  const log = fastingLog(todayKey());
  const statusCopy = fast.active
    ? fast.complete
      ? "Fast complete. Golden hour."
      : "Fast in progress. Steady does it."
    : "Not fasting. Ready when you are.";

  return `
    <section class="fasting-card ${fast.active ? "active" : ""} ${fast.complete ? "complete" : ""}">
      <div class="fasting-copy">
        <p class="eyebrow">Fasting</p>
        <h2>${statusCopy}</h2>
        <span>${fast.active ? `${fast.elapsedLabel} of ${fast.targetLabel}` : `Target ${fast.targetLabel}`}</span>
      </div>
      <div class="fasting-progress" aria-label="${fast.percent}% fasting target complete">
        <div class="fasting-meter"><span style="width:${fast.percent}%"></span></div>
        <strong>${fast.percent}%</strong>
      </div>
      <label class="fasting-log-field">
        <span>Today</span>
        <input type="number" inputmode="decimal" min="0" max="168" step="0.25" value="${formatHoursInput(log.minutes)}" data-action="fasting-log" data-date="${todayKey()}" />
      </label>
      <button class="${fast.active ? "secondary-action" : "primary-action"} fasting-toggle" data-action="toggle-fasting">
        <span>${fast.active ? "End fast" : "Start fast"}</span>
      </button>
    </section>
  `;
}

function fastingLog(dateKey) {
  state.fasting = normalizeFasting(state.fasting);
  const existing = state.fasting.logs[dateKey] || {};
  const targetHours = Number(existing.targetHours || state.fasting.targetHours || DEFAULT_FASTING.targetHours);
  const minutes = Math.max(0, Number(existing.minutes || 0));
  return {
    minutes,
    targetHours,
    hit: minutes >= targetHours * 60
  };
}

function fastingStatus(now = new Date()) {
  state.fasting = normalizeFasting(state.fasting);
  const targetMinutes = state.fasting.targetHours * 60;
  const started = state.fasting.active ? new Date(state.fasting.startedAt) : null;
  const elapsedMinutes = started && !Number.isNaN(started.getTime()) ? Math.max(0, Math.floor((now - started) / 60000)) : 0;
  const percent = state.fasting.active ? Math.min(100, Math.round((elapsedMinutes / targetMinutes) * 100)) : 0;
  return {
    active: state.fasting.active,
    complete: state.fasting.active && elapsedMinutes >= targetMinutes,
    elapsedMinutes,
    percent,
    targetLabel: durationLabel(targetMinutes),
    elapsedLabel: durationLabel(elapsedMinutes)
  };
}

function durationLabel(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatHoursInput(minutes) {
  const hours = Number(minutes || 0) / 60;
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

function dailyHabitMarkup(habit, dateKey) {
  const complete = isHabitComplete(habit, [dateKey]);
  const color = habitColor(habit);
  if (habit.type === "number") {
    return `
      <div class="habit-row daily-number-row ${complete ? "done" : ""}" style="--habit-color:${color}">
        ${habitImageMarkup(habit)}
        <div class="daily-number-copy">
          <strong>${escapeHtml(habit.name)}</strong>
          <span>Target ${formatNumber(habit.goal)} ${escapeHtml(habit.unit || "")}</span>
        </div>
        <input
          type="number"
          inputmode="numeric"
          min="0"
          step="${numberStep(habit)}"
          aria-label="${escapeAttr(`${habit.name} today`)}"
          data-action="number-entry"
          data-date="${dateKey}"
          data-habit="${habit.id}"
          value="${Number(getValue(dateKey, habit.id) || 0)}"
        />
      </div>
    `;
  }

  const checked = Boolean(getValue(dateKey, habit.id));
  return `
    <label class="habit-row ${checked ? "done" : ""}" style="--habit-color:${color}">
      <input type="checkbox" data-action="toggle-check" data-date="${dateKey}" data-habit="${habit.id}" ${checked ? "checked" : ""} />
      <span class="check-ui"></span>
      ${habitImageMarkup(habit)}
      <span>${escapeHtml(habit.name)}</span>
    </label>
  `;
}

function longTermTargetsMarkup(dateKey) {
  const groups = PERIOD_FREQUENCIES.map((frequency) => {
    const habits = activeHabits(frequency);
    if (!habits.length) return "";
    return `
      <div class="period-group">
        <div class="period-heading">
          <strong>${frequencyLabel(frequency)}</strong>
          <span>${periodLabel(frequency, dateKey)}</span>
        </div>
        <div class="period-targets">
          ${habits.map((habit) => periodHabitMarkup(habit, dateKey)).join("")}
        </div>
      </div>
    `;
  }).join("");

  return groups || `<p class="empty">No active longer-term targets.</p>`;
}

function periodHabitMarkup(habit, dateKey) {
  const dates = periodDates(habit.frequency, dateKey);

  if (habit.type === "check") {
    const doneDate = dates.find((key) => Boolean(getValue(key, habit.id))) || dateKey;
    const checked = isHabitComplete(habit, dates);
    return `
      <label class="habit-row compact ${checked ? "done" : ""}" style="--habit-color:${habitColor(habit)}">
        <input type="checkbox" data-action="period-check" data-date="${doneDate}" data-frequency="${habit.frequency}" data-habit="${habit.id}" ${checked ? "checked" : ""} />
        <span class="check-ui"></span>
        ${habitImageMarkup(habit)}
        <span>${escapeHtml(habit.name)}</span>
      </label>
    `;
  }

  const total = dates.reduce((sum, key) => sum + Number(getValue(key, habit.id) || 0), 0);
  const percent = Math.min(100, Math.round((total / Number(habit.goal || 1)) * 100));

  return `
    <div class="period-number ${percent >= 100 ? "done" : ""}" style="--habit-color:${habitColor(habit)}">
      <div class="period-number-line">
        <div class="period-number-title">
        ${habitImageMarkup(habit)}
        <strong>${escapeHtml(habit.name)}</strong>
        </div>
        <strong class="period-total">${formatNumber(total)} / ${formatNumber(habit.goal)} ${escapeHtml(habit.unit || "")} <span>${percent}%</span></strong>
        <input
          type="number"
          inputmode="numeric"
          min="0"
          step="${numberStep(habit)}"
          aria-label="${escapeAttr(`${habit.name} today`)}"
          data-action="number-entry"
          data-date="${dateKey}"
          data-habit="${habit.id}"
          value="${Number(getValue(dateKey, habit.id) || 0)}"
        />
      </div>
      <div class="meter"><span style="width:${percent}%"></span></div>
    </div>
  `;
}

function habitColor(habit) {
  if (habit?.color && /^#[0-9a-f]{6}$/i.test(habit.color)) return habit.color;
  const index = Math.max(0, orderedAllHabits().findIndex((item) => item.id === habit?.id));
  return HABIT_COLORS[index % HABIT_COLORS.length];
}

function numberStep(habit) {
  return `${habit?.name || ""} ${habit?.unit || ""}`.toLowerCase().includes("step") ? 100 : 1;
}

function habitImageMarkup(habit) {
  if (!habit.image) return "";
  return `<img class="habit-image" src="${escapeAttr(habit.image)}" alt="" />`;
}

function weekView() {
  const dates = weekDates();
  const weeklyHabits = activeHabits("weekly");

  return `
    <section class="section-heading">
      <div>
        <p class="eyebrow">This week</p>
        <h1>${weekRangeLabel()}</h1>
      </div>
      <div class="date-pill">${weeklyCompletion().complete} of ${weeklyCompletion().total} complete</div>
    </section>

    <section class="week-days">
      ${dates
        .map((dateKey) => `<div class="day-chip ${dateKey === todayKey() ? "active" : ""}"><span>${dateFromKey(dateKey).toLocaleDateString(undefined, { weekday: "short" })}</span><strong>${dateFromKey(dateKey).getDate()}</strong></div>`)
        .join("")}
    </section>

    <section class="panel">
      <div class="panel-heading">
        <h2>Weekly targets</h2>
        <span>Monday to Sunday</span>
      </div>
      <div class="habit-list">
        ${
          weeklyHabits.length
            ? weeklyHabits.map((habit) => weeklyHabitMarkup(habit, dates)).join("")
            : `<p class="empty">No active weekly targets.</p>`
        }
      </div>
    </section>
  `;
}

function weeklyHabitMarkup(habit, dates) {
  if (habit.type === "check") {
    const doneDate = dates.find((dateKey) => Boolean(getValue(dateKey, habit.id))) || todayKey();
    const checked = dates.some((dateKey) => Boolean(getValue(dateKey, habit.id)));
    return `
      <label class="habit-row ${checked ? "done" : ""}" style="--habit-color:${habitColor(habit)}">
        <input type="checkbox" data-action="weekly-check" data-date="${doneDate}" data-habit="${habit.id}" ${checked ? "checked" : ""} />
        <span class="check-ui"></span>
        <span>${escapeHtml(habit.name)}</span>
      </label>
    `;
  }

  const total = dates.reduce((sum, dateKey) => sum + Number(getValue(dateKey, habit.id) || 0), 0);
  const percent = Math.min(100, Math.round((total / Number(habit.goal || 1)) * 100));
  return `
    <div class="weekly-number">
      <div class="meter-block">
        <div class="meter-copy">
          <strong>${escapeHtml(habit.name)}</strong>
          <span>${formatNumber(total)} / ${formatNumber(habit.goal)} ${escapeHtml(habit.unit || "")}</span>
        </div>
        <div class="meter"><span style="width:${percent}%"></span></div>
      </div>
      <div class="step-grid">
        ${dates
          .map(
            (dateKey) => `
              <label class="mini-field">
                <span>${dateFromKey(dateKey).toLocaleDateString(undefined, { weekday: "short" })}</span>
                <input type="number" inputmode="numeric" min="0" step="${numberStep(habit)}" data-action="number-entry" data-date="${dateKey}" data-habit="${habit.id}" value="${Number(getValue(dateKey, habit.id) || 0)}" />
              </label>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function statsView() {
  const range = knownDateRange();
  const streak = currentStreak();
  const month = monthCalendar();

  return `
    <section class="section-heading">
      <div>
        <p class="eyebrow">Stats</p>
        <h1>Momentum</h1>
      </div>
    </section>

    <section class="streak-feature">
      <div>
        <span>Current streak</span>
        <strong>${streak}</strong>
        <small>days</small>
      </div>
      ${streak > 7 ? `<span class="streak-fire" aria-label="Streak over seven days">🔥</span>` : ""}
    </section>

    <section class="stat-grid secondary-stats">
      ${statTile("Never miss twice", neverMissTwiceStreak(), "days")}
      ${statTile("Best streak", bestStreak(), "days")}
      ${statTile("Perfect days", perfectDayCount(), "total")}
      ${statTile("Tracked days", range.length, "days")}
    </section>

    <section class="panel">
      <div class="panel-heading">
        <h2>${month.label}</h2>
        <span>${month.perfectCount} perfect days</span>
      </div>
      <div class="month-calendar">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}
        ${Array.from({ length: month.leading }, () => `<span class="calendar-blank"></span>`).join("")}
        ${month.dates.map(monthDayMarkup).join("")}
      </div>
      <div class="calendar-legend">
        <span><i class="untracked"></i>Before start</span>
        <span><i class="missed"></i>Missed</span>
        <span><i class="perfect"></i>Perfect</span>
      </div>
    </section>

    ${fastingHistoryMarkup()}
  `;
}

function fastingHistoryMarkup() {
  state.fasting = normalizeFasting(state.fasting);
  const dates = knownDateRange().slice(-14).reverse();
  const rows = dates
    .map((dateKey) => {
      const log = fastingLog(dateKey);
      const hasLog = log.minutes > 0;
      return `
        <label class="fasting-history-row ${hasLog ? (log.hit ? "hit" : "missed") : "empty"}">
          <span>
            <strong>${formatDate(dateKey, "short")}</strong>
            <small>${hasLog ? `${durationLabel(log.minutes)} / ${durationLabel(log.targetHours * 60)}` : "No fast logged"}</small>
          </span>
          <em>${hasLog ? (log.hit ? "Target hit" : "Below target") : "Skipped"}</em>
          <input type="number" inputmode="decimal" min="0" max="168" step="0.25" value="${formatHoursInput(log.minutes)}" data-action="fasting-log" data-date="${dateKey}" aria-label="${escapeAttr(`Fast hours for ${formatDate(dateKey)}`)}" />
        </label>
      `;
    })
    .join("");

  return `
    <section class="panel fasting-history-panel">
      <div class="panel-heading">
        <h2>Fasting history</h2>
        <span>Editable</span>
      </div>
      <div class="fasting-history-list">${rows}</div>
    </section>
  `;
}

function monthCalendar(dateKey = todayKey()) {
  const current = dateFromKey(dateKey);
  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const last = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  const dates = [];
  for (const date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    dates.push(toDateKey(date));
  }
  return {
    dates,
    leading: (first.getDay() + 6) % 7,
    label: current.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    perfectCount: dates.filter((key) => key <= todayKey() && isPerfectDay(key)).length
  };
}

function dayStory(dateKey) {
  if (dateKey < state.createdAt) return { status: "untracked", percent: 0 };
  if (dateKey > todayKey()) return { status: "future", percent: 0 };
  const score = dailyScore(dateKey);
  if (score.percent === 100) return { status: "perfect", percent: 100 };
  return { status: "missed", percent: score.percent };
}

function monthDayMarkup(dateKey) {
  const story = dayStory(dateKey);
  const date = dateFromKey(dateKey);
  const label = `${formatDate(dateKey)}, ${story.status}, ${story.percent}% complete`;
  return `
    <button class="calendar-day ${story.status}" data-action="toggle-history-day" data-date="${dateKey}" aria-label="${escapeAttr(label)}" ${story.status === "future" || story.status === "untracked" ? "disabled" : ""}>
      <span>${date.getDate()}</span>
      <i></i>
    </button>
  `;
}

function toggleHistoryDay(dateKey) {
  if (dateKey < state.createdAt || dateKey > todayKey()) return;
  const habits = activeHabits("daily");
  const makePerfect = !isPerfectDay(dateKey);
  habits.forEach((habit) => {
    entryFor(dateKey)[habit.id] = makePerfect ? (habit.type === "number" ? Number(habit.goal || 1) : 1) : 0;
  });
  saveState();
  render();
}

function statTile(label, value, unit) {
  return `
    <div class="stat-tile">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${unit}</small>
    </div>
  `;
}

function settingsView() {
  return `
    <section class="section-heading">
      <div>
        <p class="eyebrow">Settings</p>
        <h1>Shape your system.</h1>
      </div>
      <button class="primary-action" data-action="add-habit">${icons.plus}<span>Add target</span></button>
    </section>

    ${syncSettingsMarkup()}

    <section class="panel">
      <div class="panel-heading">
        <h2>Success System</h2>
        <span>${state.habits.length} total</span>
      </div>
      <div class="settings-list">
        ${orderedAllHabits().map(settingsHabitMarkup).join("")}
      </div>
    </section>

    <section class="panel start-date-panel">
      <div>
        <h2>Tracking start date</h2>
        <p>Days before this date are skipped and do not affect your stats.</p>
      </div>
      <label class="field">
        <span>Start date</span>
        <input type="date" max="${todayKey()}" value="${escapeAttr(state.createdAt)}" data-action="start-date" />
      </label>
    </section>

    <section class="panel fasting-settings-panel">
      <div>
        <h2>Fasting timer</h2>
        <p>Choose the target for the main-page fasting switch.</p>
      </div>
      <label class="field">
        <span>Target hours</span>
        <input type="number" min="1" max="168" step="1" value="${Number(state.fasting?.targetHours || DEFAULT_FASTING.targetHours)}" data-action="fasting-target" />
      </label>
    </section>

    <section class="data-actions">
      <button class="secondary-action" data-action="export-data">${icons.download}<span>Export everything</span></button>
      <label class="secondary-action file-action">
        <input type="file" accept="application/json" data-action="import-data" />
        <span>Import backup</span>
      </label>
      <button class="danger-action reset-action" data-action="reset-data">${icons.reset}<span>Reset everything</span></button>
    </section>
  `;
}

function syncSettingsMarkup() {
  if (syncSession) {
    return `
      <section class="panel sync-panel">
        <div class="panel-heading">
          <h2>Cloud sync</h2>
          <span class="sync-indicator online">${escapeHtml(syncStatus)}</span>
        </div>
        <div class="sync-account">
          <div>
            <strong>${escapeHtml(syncSession.user.email || "Signed in")}</strong>
            <p>Use this email on every device to share the same Perfect Day data.</p>
          </div>
          <button class="secondary-action" data-action="sync-sign-out">Sign out</button>
        </div>
        <form class="sync-password-form" data-sync-password-form>
          <label class="field">
            <span>App password</span>
            <input name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters" />
          </label>
          <button class="secondary-action" type="submit">Set app password</button>
        </form>
        <p class="sync-note">Set this once, then use it to sign in from the iOS home-screen app.</p>
      </section>
    `;
  }

  return `
    <section class="panel sync-panel">
      <div class="panel-heading">
        <h2>Cloud sync</h2>
        <span class="sync-indicator">${escapeHtml(syncStatus)}</span>
      </div>
      <form class="sync-form" data-sync-form>
        <label class="field">
          <span>Email address</span>
          <input name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
        </label>
        <label class="field">
          <span>App password</span>
          <input name="password" type="password" autocomplete="current-password" minlength="8" required placeholder="Your app password" />
        </label>
        <button class="primary-action" type="submit">Sign in</button>
        <button class="secondary-action" type="button" data-action="sync-setup-link">Email setup link</button>
      </form>
      <p class="sync-note">New here or no password yet? Open the setup link, set an app password, then sign in here.</p>
    </section>
  `;
}

function orderedAllHabits() {
  return [...state.habits].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function settingsHabitMarkup(habit) {
  return `
    <article class="settings-row ${habit.enabled ? "" : "disabled"}" data-habit-row="${habit.id}">
      <div class="settings-main">
        <label class="toggle-line">
          <input type="checkbox" data-action="toggle-enabled" data-habit="${habit.id}" ${habit.enabled ? "checked" : ""} />
          ${habitImageMarkup(habit)}
          <span>${escapeHtml(habit.name)}</span>
        </label>
        <span>${frequencyLabel(habit.frequency)} · ${habit.type === "check" ? "checkbox" : `${formatNumber(habit.goal)} ${escapeHtml(habit.unit || "")}`} · ${soundLabel(habit)}</span>
      </div>
      <div class="settings-controls">
        <button data-action="move-up" data-habit="${habit.id}" aria-label="Move ${escapeAttr(habit.name)} up" title="Move up">${icons.up}</button>
        <button data-action="move-down" data-habit="${habit.id}" aria-label="Move ${escapeAttr(habit.name)} down" title="Move down">${icons.down}</button>
        <button data-action="edit-habit" data-habit="${habit.id}" aria-label="Edit ${escapeAttr(habit.name)}" title="Edit">Edit</button>
        <button data-action="delete-habit" data-habit="${habit.id}" aria-label="Delete ${escapeAttr(habit.name)}" title="Delete">${icons.trash}</button>
      </div>
    </article>
  `;
}

function bindNav() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      render();
    });
  });
}

function bindView() {
  document.querySelectorAll("[data-action]").forEach((element) => {
    const action = element.dataset.action;

    if (action === "toggle-check") {
      element.addEventListener("change", () => setValue(element.dataset.date, element.dataset.habit, element.checked ? 1 : 0));
    }

    if (action === "weekly-check" || action === "period-check") {
      element.addEventListener("change", () => {
        const habit = findHabit(element.dataset.habit);
        const dates = periodDates(element.dataset.frequency || habit?.frequency || "weekly");
        const wasComplete = habit ? isHabitComplete(habit, dates) : false;
        dates.forEach((dateKey) => {
          if (getValue(dateKey, element.dataset.habit)) entryFor(dateKey)[element.dataset.habit] = 0;
        });
        if (element.checked) entryFor(todayKey())[element.dataset.habit] = 1;
        saveState();
        render();
        if (!wasComplete && element.checked) playHabitSound(habit);
      });
    }

    if (action === "number-entry") {
      const habit = findHabit(element.dataset.habit);
      let wasComplete = habit ? isHabitComplete(habit, periodDates(habit.frequency)) : false;
      const saveNumber = () => {
        const value = Math.max(0, Number(element.value || 0));
        entryFor(element.dataset.date)[element.dataset.habit] = value;
        saveState();
        if (habit) {
          const complete = isHabitComplete(habit, periodDates(habit.frequency));
          if (!wasComplete && complete) playHabitSound(habit);
          wasComplete = complete;
        }
      };
      element.addEventListener("input", saveNumber);
      element.addEventListener("change", () => {
        saveNumber();
        render();
      });
    }

    if (action === "add-habit") element.addEventListener("click", () => openHabitDialog());
    if (action === "edit-habit") element.addEventListener("click", () => openHabitDialog(findHabit(element.dataset.habit)));
    if (action === "delete-habit") element.addEventListener("click", () => deleteHabit(element.dataset.habit));
    if (action === "toggle-enabled") element.addEventListener("change", () => updateHabit(element.dataset.habit, { enabled: element.checked }));
    if (action === "move-up") element.addEventListener("click", () => moveHabit(element.dataset.habit, -1));
    if (action === "move-down") element.addEventListener("click", () => moveHabit(element.dataset.habit, 1));
    if (action === "export-data") element.addEventListener("click", exportData);
    if (action === "import-data") element.addEventListener("change", importData);
    if (action === "reset-data") element.addEventListener("click", openResetDialog);
    if (action === "start-date") {
      element.addEventListener("change", () => {
        state.createdAt = element.value && element.value <= todayKey() ? element.value : todayKey();
        saveState();
        render();
      });
    }
    if (action === "fasting-target") {
      element.addEventListener("change", () => {
        state.fasting = normalizeFasting({
          ...(state.fasting || {}),
          targetHours: element.value
        });
        saveState();
        render();
      });
    }
    if (action === "fasting-log") {
      element.addEventListener("change", () => {
        setFastingLog(element.dataset.date, Number(element.value || 0) * 60);
        render();
      });
    }
    if (action === "toggle-fasting") element.addEventListener("click", toggleFasting);
    if (action === "sync-sign-out") element.addEventListener("click", signOutOfSync);
    if (action === "sync-setup-link") element.addEventListener("click", sendSyncSetupLink);
    if (action === "toggle-history-day") element.addEventListener("click", () => toggleHistoryDay(element.dataset.date));
  });

  const syncForm = document.querySelector("[data-sync-form]");
  if (syncForm) {
    syncForm.addEventListener("submit", signInWithSyncPassword);
  }

  const syncPasswordForm = document.querySelector("[data-sync-password-form]");
  if (syncPasswordForm) {
    syncPasswordForm.addEventListener("submit", setSyncPassword);
  }
}

let renderTimer = 0;
function renderSoon() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 350);
}

function findHabit(id) {
  return state.habits.find((habit) => habit.id === id);
}

function updateHabit(id, patch) {
  const habit = findHabit(id);
  if (!habit) return;
  Object.assign(habit, patch);
  saveState();
  render();
}

function moveHabit(id, direction) {
  const habits = orderedAllHabits();
  const index = habits.findIndex((habit) => habit.id === id);
  const next = index + direction;
  if (next < 0 || next >= habits.length) return;
  const currentOrder = habits[index].order;
  habits[index].order = habits[next].order;
  habits[next].order = currentOrder;
  saveState();
  render();
}

function deleteHabit(id) {
  const habit = findHabit(id);
  if (!habit) return;
  const confirmed = window.confirm(`Delete "${habit.name}" and its tracked entries?`);
  if (!confirmed) return;

  state.habits = state.habits.filter((item) => item.id !== id);
  Object.values(state.entries).forEach((entry) => delete entry[id]);
  delete localSounds[id];
  saveLocalSounds();
  saveState();
  render();
}

function openHabitDialog(habit = null) {
  const isEdit = Boolean(habit);
  const selectedSound = habitSound(habit);
  const dialog = document.createElement("dialog");
  dialog.className = "habit-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="dialog-form">
      <div class="panel-heading">
        <h2>${isEdit ? "Edit target" : "Add target"}</h2>
        <button value="cancel" aria-label="Close">Close</button>
      </div>
      <label class="field">
        <span>Name</span>
        <input name="name" required maxlength="36" value="${escapeAttr(habit?.name || "")}" />
      </label>
      <div class="split-fields">
        <label class="field">
          <span>Frequency</span>
          <select name="frequency">
            <option value="daily" ${habit?.frequency === "daily" ? "selected" : ""}>Daily</option>
            <option value="weekly" ${habit?.frequency === "weekly" ? "selected" : ""}>Weekly</option>
            <option value="monthly" ${habit?.frequency === "monthly" ? "selected" : ""}>Monthly</option>
            <option value="halfyear" ${habit?.frequency === "halfyear" ? "selected" : ""}>Every 6 months</option>
            <option value="yearly" ${habit?.frequency === "yearly" ? "selected" : ""}>Yearly</option>
          </select>
        </label>
        <label class="field">
          <span>Type</span>
          <select name="type">
            <option value="check" ${habit?.type === "check" ? "selected" : ""}>Checkbox</option>
            <option value="number" ${habit?.type === "number" ? "selected" : ""}>Number</option>
          </select>
        </label>
      </div>
      <div class="split-fields">
        <label class="field">
          <span>Goal</span>
          <input name="goal" type="number" min="1" step="1" value="${Number(habit?.goal || 1)}" />
        </label>
        <label class="field">
          <span>Unit</span>
          <input name="unit" maxlength="18" value="${escapeAttr(habit?.unit || "")}" />
        </label>
      </div>
      <label class="field color-field">
        <span>Target colour</span>
        <input name="color" type="color" value="${escapeAttr(habitColor(habit))}" />
      </label>
      <label class="field image-field">
        <span>Image</span>
        <input name="image" type="file" accept="image/*" />
      </label>
      ${
        habit?.image
          ? `<div class="image-preview"><img src="${escapeAttr(habit.image)}" alt="" /><label><input name="removeImage" type="checkbox" /> Remove image</label></div>`
          : ""
      }
      <div class="split-fields sound-fields">
        <label class="field">
          <span>Completion sound</span>
          <select name="sound">
            <option value="none" ${selectedSound === "none" ? "selected" : ""}>Silent</option>
            <option value="chime" ${selectedSound === "chime" ? "selected" : ""}>Gentle chime</option>
            <option value="sauna" ${selectedSound === "sauna" ? "selected" : ""}>Sauna song</option>
            <option value="custom" ${selectedSound === "custom" ? "selected" : ""}>Custom audio</option>
          </select>
        </label>
        <label class="field custom-sound-field" ${selectedSound === "custom" ? "" : "hidden"}>
          <span>Audio file</span>
          <input name="soundFile" type="file" accept="audio/*" />
          ${habit && localSounds[habit.id] ? `<small>Custom audio saved on this device.</small>` : ""}
        </label>
      </div>
      <menu class="dialog-actions">
        <button value="cancel" class="secondary-action">Cancel</button>
        <button value="save" class="primary-action">${isEdit ? "Save" : "Add"}</button>
      </menu>
    </form>
  `;

  document.body.append(dialog);
  dialog.showModal();
  const soundSelect = dialog.querySelector('[name="sound"]');
  const customSoundField = dialog.querySelector(".custom-sound-field");
  soundSelect.addEventListener("change", () => {
    customSoundField.hidden = soundSelect.value !== "custom";
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter?.value;
    if (submitter !== "save") {
      dialog.close();
      return;
    }

    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name").toString().trim(),
      frequency: form.get("frequency").toString(),
      type: form.get("type").toString(),
      goal: Math.max(1, Number(form.get("goal") || 1)),
      unit: form.get("unit").toString().trim(),
      enabled: habit?.enabled ?? true,
      image: habit?.image || "",
      sound: form.get("sound").toString(),
      color: form.get("color").toString()
    };

    if (form.get("removeImage")) payload.image = "";
    const imageFile = form.get("image");
    if (imageFile instanceof File && imageFile.size) {
      payload.image = await resizeHabitImage(imageFile);
    }

    if (payload.type === "check") {
      payload.goal = 1;
      payload.unit = "";
    }

    const habitId = habit?.id || (window.crypto?.randomUUID ? window.crypto.randomUUID() : `habit-${Date.now()}`);
    const soundFile = form.get("soundFile");
    if (payload.sound === "custom" && soundFile instanceof File && soundFile.size) {
      try {
        localSounds[habitId] = await readSoundFile(soundFile);
        saveLocalSounds();
      } catch (error) {
        window.alert(error.message);
        return;
      }
    } else if (payload.sound !== "custom") {
      delete localSounds[habitId];
      saveLocalSounds();
    }

    if (isEdit) {
      Object.assign(habit, payload);
    } else {
      state.habits.push({
        ...payload,
        id: habitId,
        order: Math.max(0, ...state.habits.map((item) => item.order)) + 1
      });
    }

    saveState();
    dialog.close();
    render();
  });
}

function toggleFasting() {
  state.fasting = normalizeFasting(state.fasting);
  if (state.fasting.active) {
    const status = fastingStatus();
    setFastingLog(todayKey(), status.elapsedMinutes);
    state.fasting.active = false;
    state.fasting.startedAt = "";
  } else {
    state.fasting.active = true;
    state.fasting.startedAt = new Date().toISOString();
  }
  saveState();
  render();
}

function setFastingLog(dateKey, minutes) {
  state.fasting = normalizeFasting(state.fasting);
  const cleanMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  if (!cleanMinutes) {
    delete state.fasting.logs[dateKey];
    saveState();
    return;
  }
  state.fasting.logs[dateKey] = {
    minutes: cleanMinutes,
    targetHours: Number(state.fasting.targetHours || DEFAULT_FASTING.targetHours),
    updatedAt: new Date().toISOString()
  };
  saveState();
}


function exportData() {
  const backup = {
    format: "perfect-day-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    state,
    localSounds
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `perfect-day-${todayKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const importedState = parsed?.format === "perfect-day-backup" ? parsed.state : parsed;
      if (!importedState || !Array.isArray(importedState.habits) || typeof importedState.entries !== "object") {
        throw new Error("Invalid Perfect Day file");
      }
      state.habits = importedState.habits;
      state.entries = importedState.entries || {};
      state.createdAt = importedState.createdAt || todayKey();
      state.fasting = normalizeFasting(importedState.fasting);
      Object.keys(localSounds).forEach((id) => delete localSounds[id]);
      if (parsed?.format === "perfect-day-backup" && parsed.localSounds && typeof parsed.localSounds === "object") {
        Object.assign(localSounds, parsed.localSounds);
      }
      saveLocalSounds();
      saveState();
      render();
    } catch (error) {
      window.alert("That file could not be imported.");
    }
  };
  reader.readAsText(file);
}

function openResetDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="dialog-form">
      <p class="eyebrow">Permanent action</p>
      <h2>Are you sure?</h2>
      <p>This removes every target, entry, image and custom sound from this device. Export a backup first if you may want it later.</p>
      <menu class="dialog-actions">
        <button value="cancel" class="secondary-action">Keep my data</button>
        <button value="confirm" class="danger-action">Yes, reset everything</button>
      </menu>
    </form>
  `;
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "confirm") resetData();
    dialog.remove();
  });
}

function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  Object.keys(localSounds).forEach((id) => delete localSounds[id]);
  localStorage.removeItem(SOUND_STORAGE_KEY);
  Object.assign(state, {
    habits: typeof structuredClone === "function" ? structuredClone(defaultHabits) : JSON.parse(JSON.stringify(defaultHabits)),
    entries: {},
    createdAt: todayKey(),
    fasting: normalizeFasting()
  });
  activeView = "today";
  saveState();
  render();
}

async function initCloudSync() {
  if (!window.supabase?.createClient) {
    syncStatus = "Sync unavailable";
    if (activeView === "settings") render();
    return;
  }

  syncClient = window.supabase.createClient(SYNC_CONFIG.url, SYNC_CONFIG.key, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  });

  const { data, error } = await syncClient.auth.getSession();
  if (error) {
    syncStatus = "Sign-in check failed";
  } else {
    syncSession = data.session;
    if (syncSession) await loadCloudState();
  }

  syncClient.auth.onAuthStateChange((event, session) => {
    syncSession = session;
    window.setTimeout(async () => {
      if (session && event === "SIGNED_IN") await loadCloudState();
      if (!session) syncStatus = "Sign in to sync";
      render();
    }, 0);
  });

  if (activeView === "settings") render();
}

async function sendSyncSetupLink() {
  if (!syncClient) {
    window.alert("Cloud sync is not available yet. Please refresh and try again.");
    return;
  }

  const formElement = document.querySelector("[data-sync-form]");
  const form = new FormData(formElement);
  const email = form.get("email").toString().trim();
  if (!email) {
    window.alert("Enter your email address first.");
    return;
  }

  syncStatus = "Sending setup link...";
  render();

  const { error } = await syncClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: SYNC_CONFIG.redirectUrl
    }
  });

  if (error) {
    syncStatus = "Could not send link";
    window.alert(error.message);
  } else {
    syncStatus = "Check your email";
    window.alert("Your Perfect Day setup link has been sent. Open it, then set an app password in Settings.");
  }
  render();
}

async function signInWithSyncPassword(event) {
  event.preventDefault();
  if (!syncClient) return;

  const form = new FormData(event.currentTarget);
  const email = form.get("email").toString().trim();
  const password = form.get("password").toString();

  syncStatus = "Signing in...";
  render();

  const { error } = await syncClient.auth.signInWithPassword({ email, password });

  if (error) {
    syncStatus = "Sign-in failed";
    window.alert("That email or app password did not work.");
  } else {
    syncStatus = "Synced";
  }
  render();
}

async function setSyncPassword(event) {
  event.preventDefault();
  if (!syncClient || !syncSession) return;

  const form = new FormData(event.currentTarget);
  const password = form.get("password").toString();
  syncStatus = "Setting password...";
  render();

  const { error } = await syncClient.auth.updateUser({ password });
  if (error) {
    syncStatus = "Could not set password";
    window.alert(error.message);
  } else {
    syncStatus = "Password ready";
    window.alert("Your app password is ready. You can now use it in the iOS home-screen app.");
  }
  render();
}

async function signOutOfSync() {
  if (!syncClient) return;
  await syncClient.auth.signOut();
  syncSession = null;
  syncStatus = "Sign in to sync";
  render();
}

async function loadCloudState() {
  if (!syncClient || !syncSession) return;
  syncStatus = "Syncing...";

  const { data, error } = await syncClient
    .from("perfect_day_state")
    .select("data")
    .eq("user_id", syncSession.user.id)
    .maybeSingle();

  if (error) {
    syncStatus = "Sync failed";
    console.warn("Perfect Day sync failed", error);
    return;
  }

  if (data?.data?.habits && Array.isArray(data.data.habits)) {
    applyingCloudState = true;
    state.habits = data.data.habits;
    state.entries = data.data.entries || {};
    state.createdAt = data.data.createdAt || todayKey();
    state.fasting = normalizeFasting(data.data.fasting);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    applyingCloudState = false;
    syncStatus = "Synced";
  } else {
    await pushCloudState();
  }
}

function scheduleCloudSave() {
  syncStatus = "Saving...";
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(pushCloudState, 500);
}

async function pushCloudState() {
  if (!syncClient || !syncSession) return;

  const { error } = await syncClient.from("perfect_day_state").upsert({
    user_id: syncSession.user.id,
    data: state,
    updated_at: new Date().toISOString()
  });

  if (error) {
    syncStatus = "Save failed";
    console.warn("Perfect Day cloud save failed", error);
  } else {
    syncStatus = "Synced";
  }

  if (activeView === "settings") render();
}

function weekRangeLabel() {
  const dates = weekDates();
  const first = dateFromKey(dates[0]).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const last = dateFromKey(dates[6]).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${first} - ${last}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function triggerCelebration() {
  document.querySelector(".celebration-layer")?.remove();
  document.querySelector(".fireworks-canvas")?.remove();
  const perfectDays = perfectDayCount();
  const streak = currentStreak();

  const canvas = document.createElement("canvas");
  canvas.className = "fireworks-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);

  const layer = document.createElement("div");
  layer.className = "celebration-layer";
  layer.innerHTML = `
    <div class="celebration-panel" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
      <p class="eyebrow">100% complete</p>
      <h2 id="celebration-title">A Perfect Day</h2>
      <div class="celebration-stats">
        <p><strong>Perfect Day number ${perfectDays}</strong></p>
        <p>Current Streak ${streak} ${streak === 1 ? "Day" : "Days"}</p>
      </div>
      <div class="celebration-actions">
        <button class="secondary-action" data-close-celebration>Close</button>
      </div>
    </div>
  `;
  document.body.append(layer);

  const audio = playPreview(PERFECT_DAY_TRACK.previewUrl);

  const close = () => {
    if (activeAudio === audio) stopActiveAudio();
    layer.remove();
    window.setTimeout(() => canvas.remove(), 400);
  };
  layer.querySelector("[data-close-celebration]").addEventListener("click", close);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) close();
  });

  runFireworks(canvas);
}

function runFireworks(canvas) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    canvas.remove();
    return;
  }

  const context = canvas.getContext("2d");
  const colors = ["#e6b85c", "#c56b54", "#748f80", "#ffffff", "#dca6a0"];
  const particles = [];
  let frame = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const burst = (x, y) => {
    for (let index = 0; index < 46; index += 1) {
      const angle = (Math.PI * 2 * index) / 46 + Math.random() * 0.18;
      const speed = 2.2 + Math.random() * 4.4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2.6
      });
    }
  };

  const animate = () => {
    frame += 1;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (frame === 1) burst(window.innerWidth * 0.22, window.innerHeight * 0.28);
    if (frame === 22) burst(window.innerWidth * 0.78, window.innerHeight * 0.24);
    if (frame === 44) burst(window.innerWidth * 0.5, window.innerHeight * 0.14);

    particles.forEach((particle) => {
      particle.vy += 0.045;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= 0.012;
      context.globalAlpha = Math.max(0, particle.life);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    });

    context.globalAlpha = 1;
    if (frame < 150) {
      window.requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  };

  resize();
  window.addEventListener("resize", resize, { once: true });
  window.requestAnimationFrame(animate);
}

function playPreview(url) {
  if (!url) return null;
  stopActiveAudio();
  const objectUrl = url.startsWith("data:") ? soundDataUrlToObjectUrl(url) : "";
  const audio = new Audio(objectUrl || url);
  audio.volume = 0.7;
  audio.preload = "auto";
  audio.dataset.objectUrl = objectUrl;
  activeAudio = audio;
  showAudioStopControl();
  audio.addEventListener("ended", () => {
    if (activeAudio === audio) {
      activeAudio = null;
      hideAudioStopControl();
    }
    releaseAudioObjectUrl(audio);
  });
  audio.play().catch(() => {
    if (activeAudio === audio) {
      activeAudio = null;
      hideAudioStopControl();
    }
    releaseAudioObjectUrl(audio);
  });
  return audio;
}

function soundDataUrlToObjectUrl(dataUrl) {
  try {
    const [metadata, encoded] = dataUrl.split(",", 2);
    const suppliedType = metadata.match(/^data:([^;,]+)/)?.[1] || "audio/mpeg";
    const mimeType = suppliedType === "audio/x-m4a" ? "audio/mp4" : suppliedType;
    const binary = metadata.includes(";base64") ? window.atob(encoded) : decodeURIComponent(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  } catch {
    return "";
  }
}

function releaseAudioObjectUrl(audio) {
  const objectUrl = audio?.dataset?.objectUrl;
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  audio.dataset.objectUrl = "";
}

function habitSound(habit) {
  if (!habit) return "none";
  if (habit.sound) return habit.sound;
  return isSaunaHabit(habit) ? "sauna" : "none";
}

function soundLabel(habit) {
  const labels = {
    none: "silent",
    chime: "gentle chime",
    sauna: "sauna song",
    custom: localSounds[habit.id] ? "custom sound" : "custom sound unavailable"
  };
  return labels[habitSound(habit)] || "silent";
}

function playHabitSound(habit) {
  const sound = habitSound(habit);
  if (sound === "sauna") return playPreview(SAUNA_TRACK.previewUrl);
  if (sound === "chime") return playCompletionChime();
  if (sound === "custom") return playPreview(localSounds[habit.id]);
  return null;
}

function playCompletionChime() {
  stopActiveAudio();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  const master = context.createGain();
  const start = context.currentTime;
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
  master.connect(context.destination);

  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start + index * 0.1);
    oscillator.connect(master);
    oscillator.start(start + index * 0.1);
    oscillator.stop(start + index * 0.1 + 0.2);
  });

  let finishTimer = 0;
  const sound = {
    stop() {
      window.clearTimeout(finishTimer);
      context.close().catch(() => {});
    }
  };
  activeAudio = sound;
  showAudioStopControl();
  finishTimer = window.setTimeout(() => {
    if (activeAudio === sound) {
      activeAudio = null;
      hideAudioStopControl();
    }
    context.close().catch(() => {});
  }, 550);
  return sound;
}

function isSaunaHabit(habit) {
  return Boolean(habit && (habit.id === "sauna" || habit.name.toLowerCase().includes("sauna")));
}

function readSoundFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 900 * 1024) {
      reject(new Error("Please choose an audio clip smaller than 900 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that audio file."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function stopActiveAudio() {
  if (!activeAudio) return;
  if (typeof activeAudio.stop === "function") {
    activeAudio.stop();
  } else {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    releaseAudioObjectUrl(activeAudio);
  }
  activeAudio = null;
  hideAudioStopControl();
}

function showAudioStopControl() {
  let button = document.querySelector("[data-stop-audio]");
  if (button) return;
  button = document.createElement("button");
  button.className = "audio-stop-control";
  button.dataset.stopAudio = "";
  button.innerHTML = `<span class="stop-symbol" aria-hidden="true"></span><span>Stop sound</span>`;
  button.addEventListener("click", stopActiveAudio);
  document.body.append(button);
}

function hideAudioStopControl() {
  document.querySelector("[data-stop-audio]")?.remove();
}

function resizeHabitImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not load image"));
      image.onload = () => {
        const maxSize = 320;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", 0.76));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js?v=25").catch((error) => console.warn("Service worker failed", error));
  });
}

window.setInterval(() => {
  if (activeView === "today" && normalizeFasting(state.fasting).active) renderSoon();
}, 60000);

render();
initCloudSync();
