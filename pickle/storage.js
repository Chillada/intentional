export const STORAGE_KEY = "pickle-randomiser-data";
export const DATA_VERSION = 1;

export function emptyData() {
  return {
    version: DATA_VERSION,
    categories: [],
    draws: [],
    preferences: { selectedCategoryId: null },
  };
}

export function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return validateData(JSON.parse(raw));
  } catch (error) {
    console.warn("Could not load saved data", error);
    return emptyData();
  }
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function validateData(input) {
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
