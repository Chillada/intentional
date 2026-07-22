var perfectDaySoundUrlCache = new Map();

function perfectDayCacheSound(dataUrl) {
  if (perfectDaySoundUrlCache.has(dataUrl)) return perfectDaySoundUrlCache.get(dataUrl);
  const objectUrl = soundDataUrlToObjectUrl(dataUrl);
  if (objectUrl) perfectDaySoundUrlCache.set(dataUrl, objectUrl);
  return objectUrl;
}

function perfectDayPrimeSounds() {
  Object.values(localSounds).forEach((url) => {
    if (typeof url === "string" && url.startsWith("data:")) perfectDayCacheSound(url);
  });
}

function perfectDayClearSoundCache() {
  perfectDaySoundUrlCache.forEach((url) => URL.revokeObjectURL(url));
  perfectDaySoundUrlCache.clear();
}

saveLocalSounds = function () {
  localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(localSounds));
  perfectDayClearSoundCache();
  perfectDayPrimeSounds();
  if (!applyingCloudState && syncSession) scheduleCloudSave();
};

playPreview = function (url) {
  if (!url) return null;
  stopActiveAudio();
  const playableUrl = url.startsWith("data:") ? perfectDayCacheSound(url) : url;
  const audio = document.createElement("audio");
  audio.src = playableUrl || url;
  audio.volume = 0.7;
  audio.preload = "auto";
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  audio.className = "app-audio";
  document.body.append(audio);
  audio.load();
  activeAudio = audio;
  showAudioStopControl();

  const finish = () => {
    if (activeAudio === audio) {
      activeAudio = null;
      hideAudioStopControl();
    }
    audio.remove();
  };

  audio.addEventListener("ended", finish, { once: true });
  audio.play().catch(finish);
  return audio;
};

stopActiveAudio = function () {
  if (!activeAudio) return;
  if (typeof activeAudio.stop === "function") {
    activeAudio.stop();
  } else {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio.remove();
  }
  activeAudio = null;
  hideAudioStopControl();
};

loadCloudState = async function () {
  if (!syncClient || !syncSession) return;
  syncStatus = "Syncing...";
  const hasDeviceSounds = Object.keys(localSounds).length > 0;
  const { data, error } = await syncClient
    .from("perfect_day_state")
    .select("data")
    .eq("user_id", syncSession.user.id)
    .maybeSingle();

  if (error) {
    syncStatus = "Sync failed";
    console.warn("Compass sync failed", error);
    return;
  }

  if (data?.data?.habits && Array.isArray(data.data.habits)) {
    applyingCloudState = true;
    state.habits = data.data.habits;
    state.entries = data.data.entries || {};
    state.createdAt = data.data.createdAt || todayKey();
    state.fasting = normalizeFasting(data.data.fasting);
    if (data.data.localSounds && typeof data.data.localSounds === "object") {
      Object.keys(localSounds).forEach((id) => delete localSounds[id]);
      Object.assign(localSounds, data.data.localSounds);
      localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(localSounds));
      perfectDayClearSoundCache();
      perfectDayPrimeSounds();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    applyingCloudState = false;
    syncStatus = "Synced";
    if (!data.data.localSounds && hasDeviceSounds) await pushCloudState();
  } else {
    await pushCloudState();
  }
};

pushCloudState = async function () {
  if (!syncClient || !syncSession) return;
  const { error } = await syncClient.from("perfect_day_state").upsert({
    user_id: syncSession.user.id,
    data: { ...state, localSounds },
    updated_at: new Date().toISOString()
  });

  if (error) {
    syncStatus = "Save failed";
    console.warn("Compass cloud save failed", error);
  } else {
    syncStatus = "Synced";
  }
  if (activeView === "settings") render();
};

function averageDailyCompletion(dateKeys = knownDateRange()) {
  const tracked = dateKeys.filter((dateKey) => dateKey >= state.createdAt && dateKey <= todayKey());
  if (!tracked.length) return 0;
  return Math.round(tracked.reduce((sum, dateKey) => sum + dailyScore(dateKey).percent, 0) / tracked.length);
}

monthCalendar = function (dateKey = todayKey()) {
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
    alignedCount: dates.filter((key) => key >= state.createdAt && key <= todayKey() && dayOutcome(key) === "yes").length,
    averagePercent: averageDailyCompletion(dates)
  };
};

dayStory = function (dateKey) {
  if (dateKey < state.createdAt) return { status: "untracked", percent: 0 };
  if (dateKey > todayKey()) return { status: "future", percent: 0 };
  const score = dailyScore(dateKey);
  if (dayOutcome(dateKey) === "open") return { status: "partial", percent: score.percent };
  if (dayOutcome(dateKey) === "circumstance") return { status: "circumstance", percent: score.percent };
  if (score.percent === 100) return { status: "aligned", percent: 100 };
  return { status: score.percent > 0 ? "partial" : "missed", percent: score.percent };
};

monthDayMarkup = function (dateKey) {
  const story = dayStory(dateKey);
  const date = dateFromKey(dateKey);
  const label = `${formatDate(dateKey)}, ${story.status}, ${story.percent}% complete`;
  const detail = story.status === "future" || story.status === "untracked" ? "<i></i>" : `<small>${story.percent}%</small>`;
  return `
    <button class="calendar-day ${story.status}" data-action="toggle-history-day" data-date="${dateKey}" aria-label="${escapeAttr(label)}" ${story.status === "future" || story.status === "untracked" ? "disabled" : ""}>
      <span>${date.getDate()}</span>
      ${detail}
    </button>
  `;
};

statsView = function () {
  const range = knownDateRange();
  const streak = currentStreak();
  const month = monthCalendar();
  return `
    <section class="section-heading">
      <div><p class="eyebrow">Stats</p><h1>Momentum</h1></div>
    </section>
    <section class="streak-feature">
      <div><span>Current streak</span><strong>${streak}</strong><small>${streak === 1 ? "day" : "days"}</small></div>
      ${streak > 7 ? `<span class="streak-fire" aria-label="Streak over seven days">🔥</span>` : ""}
    </section>
    <section class="stat-grid secondary-stats">
      ${statTile("Never miss twice", neverMissTwiceStreak(), "days")}
      ${statTile("Best streak", bestStreak(), "days")}
      ${statTile("Aligned days", perfectDayCount(), "total")}
      ${statTile("Tracked days", range.length, "days")}
      ${statTile("Average completion", averageDailyCompletion(range), "%")}
    </section>
    <section class="stats-fasting">
      ${fastingPanelMarkup()}
      ${fastingHistoryMarkup()}
    </section>
    <section class="panel">
      <div class="panel-heading">
        <h2>${month.label}</h2>
        <span>${month.alignedCount} aligned days · ${month.averagePercent}% average</span>
      </div>
      <div class="month-calendar">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}
        ${Array.from({ length: month.leading }, () => `<span class="calendar-blank"></span>`).join("")}
        ${month.dates.map(monthDayMarkup).join("")}
      </div>
      <div class="calendar-legend">
        <span><i class="untracked"></i>Before start</span>
        <span><i class="missed"></i>Missed</span>
        <span><i class="partial"></i>In progress</span>
        <span><i class="circumstance"></i>Circumstance</span>
        <span><i class="aligned"></i>Aligned</span>
      </div>
    </section>
  `;
};

perfectDayPrimeSounds();
render();
window.setInterval(updateFastingTicker, 1000);
