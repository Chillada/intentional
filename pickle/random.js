export function probabilityFor(item, items) {
  const active = items.filter((entry) => !entry.archived);
  const total = active.reduce((sum, entry) => sum + entry.weight, 0);
  return total ? item.weight / total : 0;
}

export function weightedPick(items, random = secureRandom) {
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

export function segmentCentre(itemId, items) {
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
