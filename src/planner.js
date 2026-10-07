export function plan(text, people = 1, days = 7) {
  if (typeof text !== 'string' || text.length > 10000) throw new Error('Enter a grocery list under 10,000 characters.');
  if (!Number.isInteger(people) || people < 1 || people > 10 || !Number.isInteger(days) || days < 1 || days > 30) throw new Error('Choose 1–10 people and 1–30 days.');
  const lines = text.split(/[\n,]/).map(s => s.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
  if (!lines.length || lines.length > 60) throw new Error('Enter between 1 and 60 groceries.');
  const items = new Map();
  for (const line of lines) {
    const match = line.match(/^(\d+)\s*(?:x\s*|×\s*|\s+)(.+)$/i);
    const name = (match ? match[2] : line).trim();
    const quantity = match ? Number(match[1]) : Math.min(6, Math.max(1, Math.ceil(people * days / 7)));
    if (!name || name.length > 120 || quantity < 1 || quantity > 20) throw new Error('Use short grocery names and quantities from 1 to 20.');
    const key = name.toLowerCase();
    const existing = items.get(key);
    if (existing) { existing.quantity += quantity; if (existing.quantity > 20) throw new Error('Limit each grocery to 20 packages.'); }
    else items.set(key, { name, quantity, explicit: Boolean(match) });
  }
  return [...items.values()];
}

export function isPurchaseUrl(url) {
  // Login URLs carry return URLs and opaque tokens in their query string.
  // Check the actual destination path; redirected requests are checked again.
  return /(?:checkout|buy[\W_]*now|buy[\W_]*one[\W_]*click|one[\W_]*click|place[\W_]*order|submit[\W_]*order|\/gp\/buy|\/gp\/aw\/ya|\/ordering\/)/i.test(decodeURIComponent(new URL(url).pathname));
}

export function searchTerms(query) {
  return query.split(/\s*\/\s*|\s+or\s+/i).map(s => s.trim()).filter(Boolean).map((part, i, parts) => {
    // Shared noun: “white or red onions” means white onions OR red onions.
    if (i < parts.length - 1 && /^(white|red|yellow|green)$/i.test(part)) {
      const noun = parts.at(-1).split(/\s+/).slice(1).join(' ');
      if (noun) return `${part} ${noun}`;
    }
    return part;
  });
}

export function matchesProduct(query, title) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(w => w.length > 3 ? w.replace(/s$/, '') : w);
  const words = normalize(title);
  return searchTerms(query).some(term => {
    const required = normalize(term);
    return required.length > 0 && required.every(word => words.includes(word));
  });
}
