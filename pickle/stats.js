export function categoryStats(category, allDraws) {
  const draws = allDraws.filter((draw) => draw.categoryId === category.id);
  const counts = new Map();
  for (const draw of draws) counts.set(draw.itemId, (counts.get(draw.itemId) ?? 0) + 1);
  const ranked = category.items
    .map((item) => ({ item, wins: counts.get(item.id) ?? 0 }))
    .sort((a, b) => b.wins - a.wins || a.item.name.localeCompare(b.item.name));
  return { draws, counts, ranked, leader: ranked.find((entry) => entry.wins > 0) ?? null };
}

export function formatDate(iso, options = {}) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(iso));
}
