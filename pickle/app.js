// Kept dependency-free and self-contained so the app works directly from file://.
const STORAGE_KEY = "pickle-randomiser-data";
const DATA_VERSION = 1;
const SYNC_CONFIG = {
  url: "https://hwjyupnbybekckearloz.supabase.co",
  key: "sb_publishable_dtdIdtfFdTVYqkWGEVxVQA_XN2ZetBM",
  redirectUrl: "https://chillada.github.io/intentional/",
  table: "pickle_state",
};

function emptyData() {
  return {
    version: DATA_VERSION,
    categories: [],
    draws: [],
    preferences: { selectedCategoryId: null },
  };
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return validateData(JSON.parse(raw));
  } catch (error) {
    console.warn("Could not load saved data", error);
    return emptyData();
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function validateData(input) {
  if (!input || typeof input !== "object" || input.version !== DATA_VERSION) {
    throw new Error(`This is not a supported Pickle v${DATA_VERSION} backup.`);
  }
  if (!Array.isArray(input.categories) || !Array.isArray(input.draws)) {
    throw new Error("The backup is missing categories or draw history.");
  }

  const categoryIds = new Set();
  for (const category of input.categories) {
    if (!isText(category.id) || !isText(category.name) || !isColour(category.colour) || !Array.isArray(category.items)) {
      throw new Error("A list in the backup is invalid.");
    }
    if (categoryIds.has(category.id)) throw new Error("The backup contains duplicate list IDs.");
    categoryIds.add(category.id);
    const itemIds = new Set();
    for (const item of category.items) {
      if (!isText(item.id) || !isText(item.name) || !isColour(item.colour)
        || !Number.isInteger(item.weight) || item.weight < 1 || item.weight > 10
        || typeof item.archived !== "boolean") {
        throw new Error(`An option in “${category.name}” is invalid.`);
      }
      if (itemIds.has(item.id)) throw new Error(`“${category.name}” contains duplicate option IDs.`);
      itemIds.add(item.id);
    }
  }

  for (const draw of input.draws) {
    if (!isText(draw.id) || !categoryIds.has(draw.categoryId) || !isText(draw.itemId)
      || !isText(draw.itemName) || !isText(draw.createdAt)
      || !Number.isInteger(draw.weight) || typeof draw.probability !== "number") {
      throw new Error("A draw record in the backup is invalid.");
    }
  }

  return {
    version: DATA_VERSION,
    categories: structuredClone(input.categories),
    draws: structuredClone(input.draws),
    preferences: {
      selectedCategoryId: categoryIds.has(input.preferences?.selectedCategoryId)
        ? input.preferences.selectedCategoryId
        : input.categories[0]?.id ?? null,
    },
  };
}

function isText(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function isColour(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function probabilityFor(item, items) {
  const active = items.filter((entry) => !entry.archived);
  const total = active.reduce((sum, entry) => sum + entry.weight, 0);
  return total ? item.weight / total : 0;
}

function weightedPick(items, random = secureRandom) {
  const active = items.filter((item) => !item.archived);
  const total = active.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return null;
  let cursor = random() * total;
  for (const item of active) {
    cursor -= item.weight;
    if (cursor < 0) return item;
  }
  return active.at(-1);
}

function segmentCentre(itemId, items) {
  const active = items.filter((item) => !item.archived);
  const total = active.reduce((sum, item) => sum + item.weight, 0);
  let cursor = 0;
  for (const item of active) {
    const start = cursor / total;
    cursor += item.weight;
    if (item.id === itemId) return ((start + cursor / total) / 2) * 360;
  }
  return 0;
}

function secureRandom() {
  if (!globalThis.crypto?.getRandomValues) return Math.random();
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 0x100000000;
}

function categoryStats(category, allDraws) {
  const draws = allDraws.filter((draw) => draw.categoryId === category.id);
  const counts = new Map();
  for (const draw of draws) counts.set(draw.itemId, (counts.get(draw.itemId) ?? 0) + 1);
  const ranked = category.items
    .map((item) => ({ item, wins: counts.get(item.id) ?? 0 }))
    .sort((a, b) => b.wins - a.wins || a.item.name.localeCompare(b.item.name));
  return { draws, counts, ranked, leader: ranked.find((entry) => entry.wins > 0) ?? null };
}

function formatDate(iso, options = {}) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(iso));
}

const CATEGORY_COLOURS = ["#6d4aff", "#ff6f91", "#18a7a4", "#f28b30", "#3976e8", "#9b59b6", "#e04b3f", "#507d46"];
const ITEM_COLOURS = ["#ff6f91", "#ffd84d", "#18a7a4", "#6d4aff", "#f28b30", "#3976e8", "#9b59b6", "#67b95b"];

let state = loadData();
let editingCategoryId = null;
let editingItemId = null;
let rotation = 0;
let spinning = false;
let toastTimer;
let syncClient = null;
let syncSession = null;
let syncStatus = "Local only";
let syncDetail = "Keep using Pickle locally, or sign in to sync lists, weights, history and stats across devices.";
let cloudSaveTimer = 0;
let applyingCloudState = false;

const $ = (selector) => document.querySelector(selector);
const elements = {
  empty: $("#empty-state"), workspace: $("#workspace"), categoryList: $("#category-list"),
  title: $("#category-title"), subtitle: $("#category-subtitle"), itemList: $("#item-list"),
  archivedBlock: $("#archived-block"), archivedList: $("#archived-list"), archivedCount: $("#archived-count"),
  archivedToggle: $("#archived-toggle"), wheel: $("#wheel"), spin: $("#spin-button"), spinHint: $("#spin-hint"),
  stats: $("#stats-grid"), optionStats: $("#option-stats"), history: $("#history-list"), categoryDialog: $("#category-dialog"),
  itemDialog: $("#item-dialog"), historyDialog: $("#history-dialog"), dataDialog: $("#data-dialog"),
  winnerDialog: $("#winner-dialog"), toast: $("#toast"),
};

function currentCategory() {
  return state.categories.find((category) => category.id === state.preferences.selectedCategoryId) ?? state.categories[0] ?? null;
}

function commit() {
  saveData(state);
  scheduleCloudSave();
  render();
}

function replaceState(nextState) {
  state = validateData(nextState);
  saveData(state);
  render();
}

function mergeData(localData, cloudData) {
  const merged = emptyData();
  const categories = new Map();
  for (const category of [...cloudData.categories, ...localData.categories]) {
    const existing = categories.get(category.id);
    if (!existing) {
      categories.set(category.id, structuredClone(category));
      continue;
    }
    const preferred = Date.parse(category.updatedAt || category.createdAt || 0) >= Date.parse(existing.updatedAt || existing.createdAt || 0)
      ? category
      : existing;
    const items = new Map();
    for (const item of [...existing.items, ...category.items]) {
      const previous = items.get(item.id);
      if (!previous || Date.parse(item.updatedAt || item.createdAt || 0) >= Date.parse(previous.updatedAt || previous.createdAt || 0)) {
        items.set(item.id, structuredClone(item));
      }
    }
    categories.set(category.id, { ...structuredClone(preferred), items: [...items.values()] });
  }
  const draws = new Map();
  for (const draw of [...cloudData.draws, ...localData.draws]) draws.set(draw.id, structuredClone(draw));
  merged.categories = [...categories.values()];
  merged.draws = [...draws.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  merged.preferences.selectedCategoryId = localData.preferences?.selectedCategoryId
    ?? cloudData.preferences?.selectedCategoryId
    ?? merged.categories[0]?.id
    ?? null;
  return validateData(merged);
}

function render() {
  const category = currentCategory();
  elements.empty.hidden = Boolean(category);
  elements.workspace.hidden = !category;
  if (!category) return;
  if (state.preferences.selectedCategoryId !== category.id) {
    state.preferences.selectedCategoryId = category.id;
    saveData(state);
  }
  renderCategories(category);
  renderCategory(category);
  renderItems(category);
  renderWheel(category);
  renderStats(category);
}

function renderCategories(selected) {
  elements.categoryList.replaceChildren(...state.categories.map((category) => {
    const stats = categoryStats(category, state.draws);
    const button = el("button", "category-link", `
      <span class="category-dot" style="background:${category.colour}"></span>
      <span>${escapeHtml(category.name)}</span>
      <small>${stats.draws.length}</small>
    `);
    button.type = "button";
    button.classList.toggle("active", category.id === selected.id);
    button.addEventListener("click", () => {
      state.preferences.selectedCategoryId = category.id;
      rotation = 0;
      commit();
    });
    return button;
  }));
}

function renderCategory(category) {
  const stats = categoryStats(category, state.draws);
  const activeCount = category.items.filter((item) => !item.archived).length;
  elements.title.textContent = category.name;
  elements.subtitle.textContent = `${activeCount} active option${activeCount === 1 ? "" : "s"} · ${stats.draws.length} spin${stats.draws.length === 1 ? "" : "s"}`;
}

function renderItems(category) {
  const active = category.items.filter((item) => !item.archived);
  const archived = category.items.filter((item) => item.archived);
  if (!active.length) {
    const empty = el("div", "empty-items", "No options yet.<br>Add at least one to start spinning.");
    elements.itemList.replaceChildren(empty);
  } else {
    elements.itemList.replaceChildren(...active.map((item) => {
      const chance = probabilityFor(item, category.items);
      const row = el("div", "item-row", `
        <span class="item-swatch" style="background:${item.colour}"></span>
        <div class="item-meta">
          <strong>${escapeHtml(item.name)}</strong>
          <small>Weight ${item.weight} · ${formatPercent(chance)} chance</small>
        </div>
        <div class="item-row-actions"></div>
      `);
      const actions = row.querySelector(".item-row-actions");
      const edit = el("button", "mini-button", "Edit");
      edit.type = "button";
      edit.addEventListener("click", () => openItemDialog(item));
      const archive = el("button", "mini-button", "Archive");
      archive.type = "button";
      archive.addEventListener("click", () => {
        item.archived = true;
        item.updatedAt = new Date().toISOString();
        commit();
        toast("Option archived");
      });
      actions.append(edit, archive);
      return row;
    }));
  }
  elements.archivedBlock.hidden = !archived.length;
  elements.archivedCount.textContent = `(${archived.length})`;
  elements.archivedList.replaceChildren(...archived.map((item) => {
    const row = el("div", "archived-row");
    const name = el("span", "", item.name);
    const restore = el("button", "mini-button", "Restore");
    restore.type = "button";
    restore.addEventListener("click", () => {
      item.archived = false;
      item.updatedAt = new Date().toISOString();
      commit();
      toast("Option restored");
    });
    row.append(name, restore);
    return row;
  }));
}

function renderWheel(category) {
  const canvas = elements.wheel;
  const context = canvas.getContext("2d");
  const active = category.items.filter((item) => !item.archived);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  if (!active.length) {
    context.fillStyle = "#eee9e0";
    context.beginPath();
    context.arc(0, 0, 310, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#706a7d";
    context.font = "800 30px system-ui";
    context.textAlign = "center";
    context.fillText("Add an option", 0, -115);
  } else {
    const total = active.reduce((sum, item) => sum + item.weight, 0);
    let cursor = -Math.PI / 2;
    for (const item of active) {
      const angle = (item.weight / total) * Math.PI * 2;
      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, 320, cursor, cursor + angle);
      context.closePath();
      context.fillStyle = item.colour;
      context.fill();
      context.strokeStyle = "#1d1730";
      context.lineWidth = active.length > 1 ? 5 : 0;
      context.stroke();
      drawWheelLabel(context, item.name, cursor + angle / 2, angle);
      cursor += angle;
    }
  }
  context.restore();
  canvas.style.transform = `rotate(${rotation}deg)`;
  elements.spin.disabled = spinning || !active.length;
  elements.spinHint.textContent = !active.length ? "Add an option to wake up the wheel." : active.length === 1 ? "A very suspenseful one-horse race." : "Weighted fairly. Picked securely.";
}

function drawWheelLabel(context, text, angle, segmentAngle) {
  context.save();
  context.rotate(angle);
  context.translate(190, 0);
  if (angle > Math.PI / 2 && angle < Math.PI * 1.5) context.rotate(Math.PI);
  context.fillStyle = bestTextColour(context.fillStyle);
  context.textAlign = "center";
  context.textBaseline = "middle";
  const size = segmentAngle < .45 ? 17 : segmentAngle < .8 ? 22 : 27;
  context.font = `900 ${size}px system-ui`;
  const clipped = text.length > 18 ? `${text.slice(0, 17)}…` : text;
  context.fillText(clipped, 0, 0, 220);
  context.restore();
}

function bestTextColour() {
  return "#1d1730";
}

function renderStats(category) {
  const stats = categoryStats(category, state.draws);
  const latest = stats.draws.at(-1);
  const leaderPercent = stats.leader && stats.draws.length ? stats.leader.wins / stats.draws.length : 0;
  const cards = [
    ["Total spins", String(stats.draws.length), stats.draws.length ? "Every decision counts." : "Your story starts with a spin."],
    ["Top pick", stats.leader?.item.name ?? "No winner yet", stats.leader ? `${stats.leader.wins} win${stats.leader.wins === 1 ? "" : "s"} · ${formatPercent(leaderPercent)}` : "Spin to crown a leader."],
    ["Last result", latest?.itemName ?? "Nothing yet", latest ? formatDate(latest.createdAt) : "The wheel is waiting."],
  ];
  elements.stats.replaceChildren(...cards.map(([label, value, detail]) =>
    el("article", "stat-card", `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small>`)
  ));

  const heading = el("div", "option-stats-heading", `
    <div>
      <p class="eyebrow">Option breakdown</p>
      <h3>How often each was chosen</h3>
    </div>
    <span>${stats.draws.length ? `${stats.draws.length} recorded result${stats.draws.length === 1 ? "" : "s"}` : "No results yet"}</span>
  `);
  const list = el("div", "option-stat-list");
  if (!category.items.length) {
    list.append(el("div", "empty-items", "Add options to see their results here."));
  } else {
    list.replaceChildren(...stats.ranked.map(({ item, wins }) => {
      const resultShare = stats.draws.length ? wins / stats.draws.length : 0;
      const expectedChance = item.archived ? null : probabilityFor(item, category.items);
      return el("div", "option-stat-row", `
        <div class="option-stat-name">
          <span class="category-dot" style="background:${item.colour}"></span>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            ${item.archived ? '<span class="archive-tag">Archived</span>' : ""}
          </div>
        </div>
        <div class="option-stat-bar" aria-label="${escapeHtml(item.name)} has ${formatPercent(resultShare)} of recorded results">
          <span style="width:${resultShare * 100}%;background:${item.colour}"></span>
        </div>
        <div class="option-stat-detail">
          <strong>${wins} ${wins === 1 ? "time" : "times"}</strong>
          <small>${formatPercent(resultShare)} of results${expectedChance === null ? "" : ` · ${formatPercent(expectedChance)} chance`}</small>
        </div>
      `);
    }));
  }
  elements.optionStats.replaceChildren(heading, list);
}

function openCategoryDialog(category = null) {
  editingCategoryId = category?.id ?? null;
  $("#category-dialog-title").textContent = category ? "Edit list" : "New list";
  $("#category-name").value = category?.name ?? "";
  $("#delete-category-button").hidden = !category;
  renderColourPicker($("#category-colours"), "category-colour", CATEGORY_COLOURS, category?.colour ?? CATEGORY_COLOURS[0]);
  elements.categoryDialog.showModal();
  queueMicrotask(() => $("#category-name").focus());
}

function openItemDialog(item = null) {
  editingItemId = item?.id ?? null;
  $("#item-dialog-title").textContent = item ? "Edit option" : "Add option";
  $("#item-name").value = item?.name ?? "";
  $("#item-weight").value = item?.weight ?? 1;
  $("#weight-output").value = item?.weight ?? 1;
  renderColourPicker($("#item-colours"), "item-colour", ITEM_COLOURS, item?.colour ?? ITEM_COLOURS[currentCategory().items.length % ITEM_COLOURS.length]);
  elements.itemDialog.showModal();
  queueMicrotask(() => $("#item-name").focus());
}

function renderColourPicker(container, name, colours, selected) {
  container.replaceChildren(...colours.map((colour) => {
    const label = el("label", "colour-choice", `<input type="radio" name="${name}" value="${colour}" ${colour === selected ? "checked" : ""}><span style="background:${colour}"></span>`);
    label.title = colour;
    return label;
  }));
}

function saveCategoryFromForm(event) {
  event.preventDefault();
  const name = $("#category-name").value.trim();
  if (!name) return $("#category-name").focus();
  const colour = document.querySelector('input[name="category-colour"]:checked').value;
  const now = new Date().toISOString();
  if (editingCategoryId) {
    const category = state.categories.find((entry) => entry.id === editingCategoryId);
    category.name = name;
    category.colour = colour;
    category.updatedAt = now;
  } else {
    const category = { id: makeId("cat"), name, colour, items: [], createdAt: now, updatedAt: now };
    state.categories.push(category);
    state.preferences.selectedCategoryId = category.id;
  }
  elements.categoryDialog.close();
  commit();
}

function saveItemFromForm(event) {
  event.preventDefault();
  const category = currentCategory();
  const name = $("#item-name").value.trim();
  if (!name) return $("#item-name").focus();
  const weight = Number($("#item-weight").value);
  const colour = document.querySelector('input[name="item-colour"]:checked').value;
  const now = new Date().toISOString();
  if (editingItemId) {
    const item = category.items.find((entry) => entry.id === editingItemId);
    Object.assign(item, { name, weight, colour, updatedAt: now });
  } else {
    category.items.push({ id: makeId("item"), name, weight, colour, archived: false, createdAt: now, updatedAt: now });
  }
  category.updatedAt = now;
  elements.itemDialog.close();
  commit();
}

function spin() {
  const category = currentCategory();
  const winner = weightedPick(category.items);
  if (!winner || spinning) return;
  spinning = true;
  elements.spin.disabled = true;
  const centre = segmentCentre(winner.id, category.items);
  const rounds = 5 + Math.floor(Math.random() * 3);
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  rotation += rounds * 360 + (360 - centre - normalizedRotation);
  elements.wheel.style.transform = `rotate(${rotation}deg)`;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => finishSpin(category, winner), reducedMotion ? 30 : 4300);
}

function finishSpin(category, winner) {
  const probability = probabilityFor(winner, category.items);
  state.draws.push({
    id: makeId("draw"), categoryId: category.id, itemId: winner.id, itemName: winner.name,
    weight: winner.weight, probability, createdAt: new Date().toISOString(),
  });
  spinning = false;
  saveData(state);
  scheduleCloudSave();
  render();
  $("#winner-name").textContent = winner.name;
  $("#winner-detail").textContent = `${formatPercent(probability)} chance on this spin`;
  $(".winner-burst").style.background = winner.colour;
  elements.winnerDialog.showModal();
}

function openHistory() {
  const category = currentCategory();
  const draws = categoryStats(category, state.draws).draws.slice().reverse();
  if (!draws.length) {
    elements.history.replaceChildren(el("div", "empty-items", "No spins recorded yet."));
  } else {
    elements.history.replaceChildren(...draws.map((draw) => {
      const row = el("div", "history-row");
      const copy = el("div", "", `<strong>${escapeHtml(draw.itemName)}</strong><time datetime="${draw.createdAt}">${escapeHtml(formatDate(draw.createdAt))} · ${formatPercent(draw.probability)} chance</time>`);
      const remove = el("button", "mini-button", "Delete");
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete ${draw.itemName} result from ${formatDate(draw.createdAt)}`);
      remove.addEventListener("click", () => {
        if (!confirm("Delete this draw? The list statistics will be updated.")) return;
        state.draws = state.draws.filter((entry) => entry.id !== draw.id);
        saveData(state);
        scheduleCloudSave();
        render();
        openHistoryContents();
        toast("Draw deleted");
      });
      row.append(copy, remove);
      return row;
    }));
  }
  elements.historyDialog.showModal();
}

function openHistoryContents() {
  if (elements.historyDialog.open) elements.historyDialog.close();
  openHistory();
}

function deleteCategory() {
  const category = currentCategory();
  if (!category || !confirm(`Delete “${category.name}” and all of its history? This cannot be undone.`)) return;
  state.categories = state.categories.filter((entry) => entry.id !== category.id);
  state.draws = state.draws.filter((draw) => draw.categoryId !== category.id);
  state.preferences.selectedCategoryId = state.categories[0]?.id ?? null;
  elements.categoryDialog.close();
  commit();
  toast("List deleted");
}

function clearHistory() {
  const category = currentCategory();
  const count = categoryStats(category, state.draws).draws.length;
  if (!count) return toast("There is no history to clear");
  if (!confirm(`Clear all ${count} draw${count === 1 ? "" : "s"} for “${category.name}”?`)) return;
  state.draws = state.draws.filter((draw) => draw.categoryId !== category.id);
  commit();
  toast("History cleared");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pickle-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  $("#data-message").textContent = "Backup exported.";
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = validateData(JSON.parse(await file.text()));
    if (!confirm(`Replace your current data with this backup (${imported.categories.length} lists, ${imported.draws.length} spins)?`)) return;
    replaceState(imported);
    elements.dataDialog.close();
    toast("Backup restored");
  } catch (error) {
    $("#data-message").textContent = error.message;
  } finally {
    event.target.value = "";
  }
}

function resetEverything() {
  if (!confirm("Reset Pickle and permanently delete every list and spin?")) return;
  state = emptyData();
  localStorage.removeItem(STORAGE_KEY);
  scheduleCloudSave();
  elements.dataDialog.close();
  render();
  toast("Everything reset");
}

async function initCloudSync() {
  if (!location.protocol.startsWith("http")) {
    syncStatus = "Local only";
    syncDetail = "Open the GitHub Pages version to use sign-in and cloud sync.";
    renderSyncPanel();
    return;
  }
  if (!window.supabase?.createClient) {
    syncStatus = "Sync unavailable";
    syncDetail = "The Supabase library could not load. Pickle will keep using local storage.";
    renderSyncPanel();
    return;
  }

  syncClient = window.supabase.createClient(SYNC_CONFIG.url, SYNC_CONFIG.key, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });

  const { data, error } = await syncClient.auth.getSession();
  if (error) {
    syncStatus = "Sign-in check failed";
    syncDetail = error.message;
  } else {
    syncSession = data.session;
    if (syncSession) await loadCloudState();
    else {
      syncStatus = "Local only";
      syncDetail = "Sign in to keep this device in sync with your others.";
    }
  }

  syncClient.auth.onAuthStateChange((event, session) => {
    syncSession = session;
    window.setTimeout(async () => {
      if (session && event === "SIGNED_IN") await loadCloudState();
      if (!session) {
        syncStatus = "Local only";
        syncDetail = "Signed out. Pickle is still saved on this device.";
      }
      renderSyncPanel();
    }, 0);
  });

  renderSyncPanel();
}

async function sendSyncLink(event) {
  event.preventDefault();
  if (!syncClient) return toast("Cloud sync is not available");
  const email = $("#sync-email").value.trim();
  if (!email) return $("#sync-email").focus();

  syncStatus = "Sending link...";
  syncDetail = "Check your inbox in a moment.";
  renderSyncPanel();
  const { error } = await syncClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: SYNC_CONFIG.redirectUrl },
  });
  if (error) {
    syncStatus = "Link failed";
    syncDetail = error.message;
    toast("Could not send sign-in link");
  } else {
    syncStatus = "Check email";
    syncDetail = "Open the sign-in link on this device. After that, Pickle will sync automatically.";
    toast("Sign-in link sent");
  }
  renderSyncPanel();
}

async function signInWithPassword(event) {
  event.preventDefault();
  if (!syncClient) return toast("Cloud sync is not available");
  const email = $("#sync-email").value.trim();
  const password = $("#sync-password").value;
  if (!email) return $("#sync-email").focus();
  if (!password) return $("#sync-password").focus();

  syncStatus = "Signing in...";
  syncDetail = "Opening the cloud pickle jar.";
  renderSyncPanel();
  const { error } = await syncClient.auth.signInWithPassword({ email, password });
  if (error) {
    syncStatus = "Sign-in failed";
    syncDetail = "That email or app password did not work.";
    toast("Sign-in failed");
  }
  renderSyncPanel();
}

async function setSyncPassword(event) {
  event.preventDefault();
  if (!syncClient || !syncSession) return toast("Sign in first");
  const password = $("#sync-new-password").value;
  if (!password || password.length < 6) return $("#sync-new-password").focus();

  syncStatus = "Saving password...";
  syncDetail = "This lets you sign in from a home-screen app if email links are awkward.";
  renderSyncPanel();
  const { error } = await syncClient.auth.updateUser({ password });
  if (error) {
    syncStatus = "Password failed";
    syncDetail = error.message;
    toast("Could not save password");
  } else {
    syncStatus = "Synced";
    syncDetail = "App password saved. Your Pickle data is synced.";
    $("#sync-new-password").value = "";
    toast("App password saved");
  }
  renderSyncPanel();
}

async function signOutOfSync() {
  if (!syncClient) return;
  await syncClient.auth.signOut();
  syncSession = null;
  syncStatus = "Local only";
  syncDetail = "Signed out. Pickle is still saved on this device.";
  renderSyncPanel();
}

async function loadCloudState() {
  if (!syncClient || !syncSession) return;
  syncStatus = "Syncing...";
  syncDetail = "Checking for saved Pickle data.";
  renderSyncPanel();
  const { data, error } = await syncClient
    .from(SYNC_CONFIG.table)
    .select("data, updated_at")
    .eq("user_id", syncSession.user.id)
    .maybeSingle();

  if (error) {
    syncStatus = "Sync failed";
    syncDetail = error.message;
    console.warn("Pickle cloud sync failed", error);
    renderSyncPanel();
    return;
  }

  const localHasData = state.categories.length || state.draws.length;
  if (data?.data?.version === DATA_VERSION) {
    applyingCloudState = true;
    replaceState(localHasData ? mergeData(state, data.data) : data.data);
    applyingCloudState = false;
    syncStatus = "Synced";
    syncDetail = `Signed in as ${syncSession.user.email}.`;
    if (localHasData) await pushCloudState();
  } else if (localHasData) {
    await pushCloudState();
  } else {
    syncStatus = "Synced";
    syncDetail = `Signed in as ${syncSession.user.email}. Create a list and it will sync.`;
  }
  renderSyncPanel();
}

function scheduleCloudSave() {
  if (applyingCloudState || !syncClient || !syncSession) return;
  syncStatus = "Saving...";
  syncDetail = "Uploading your latest lists and spin history.";
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(pushCloudState, 600);
  renderSyncPanel();
}

async function pushCloudState() {
  if (!syncClient || !syncSession) return;
  const { error } = await syncClient.from(SYNC_CONFIG.table).upsert({
    user_id: syncSession.user.id,
    data: state,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    syncStatus = "Save failed";
    syncDetail = error.message;
    console.warn("Pickle cloud save failed", error);
  } else {
    syncStatus = "Synced";
    syncDetail = `Signed in as ${syncSession.user.email}.`;
  }
  renderSyncPanel();
}

function renderSyncPanel() {
  const status = $("#sync-status");
  if (!status) return;
  status.textContent = syncStatus;
  $("#sync-detail").textContent = syncDetail;
  $("#sync-link-form").hidden = Boolean(syncSession);
  $("#sync-password-form").hidden = Boolean(syncSession);
  $("#sync-set-password-form").hidden = !syncSession;
  $("#sync-sign-out-button").hidden = !syncSession;
  $("#sync-now-button").hidden = !syncSession;
  if (syncSession && !$("#sync-email").value) $("#sync-email").value = syncSession.user.email ?? "";
}

function el(tag, className = "", html = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.innerHTML = html;
  return node;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function formatPercent(value) {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function toast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

$("#new-category-button").addEventListener("click", () => openCategoryDialog());
$("#empty-create-button").addEventListener("click", () => openCategoryDialog());
$("#sidebar-add-button").addEventListener("click", () => openCategoryDialog());
$("#edit-category-button").addEventListener("click", () => openCategoryDialog(currentCategory()));
$("#add-item-button").addEventListener("click", () => openItemDialog());
$("#category-form").addEventListener("submit", saveCategoryFromForm);
$("#item-form").addEventListener("submit", saveItemFromForm);
$("#item-weight").addEventListener("input", (event) => { $("#weight-output").value = event.target.value; });
$("#delete-category-button").addEventListener("click", deleteCategory);
elements.spin.addEventListener("click", spin);
$("#history-button").addEventListener("click", openHistory);
$("#close-history-button").addEventListener("click", () => elements.historyDialog.close());
$("#clear-history-button").addEventListener("click", clearHistory);
elements.archivedToggle.addEventListener("click", () => {
  const expanded = elements.archivedToggle.getAttribute("aria-expanded") === "true";
  elements.archivedToggle.setAttribute("aria-expanded", String(!expanded));
  elements.archivedList.hidden = expanded;
});
$("#data-button").addEventListener("click", () => {
  $("#data-message").textContent = `Backup format version ${DATA_VERSION}.`;
  elements.dataDialog.showModal();
});
$("#close-data-button").addEventListener("click", () => elements.dataDialog.close());
$("#export-button").addEventListener("click", exportData);
$("#import-input").addEventListener("change", importData);
$("#reset-button").addEventListener("click", resetEverything);
$("#sync-link-form").addEventListener("submit", sendSyncLink);
$("#sync-password-form").addEventListener("submit", signInWithPassword);
$("#sync-set-password-form").addEventListener("submit", setSyncPassword);
$("#sync-sign-out-button").addEventListener("click", signOutOfSync);
$("#sync-now-button").addEventListener("click", () => {
  pushCloudState();
  toast("Syncing now");
});
$("#winner-close-button").addEventListener("click", () => elements.winnerDialog.close());
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
});

render();
initCloudSync();

if (window.self === window.top && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Offline support could not be enabled", error);
    });
  });
}
