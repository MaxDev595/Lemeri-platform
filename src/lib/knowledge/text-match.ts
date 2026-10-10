// Tiny language-agnostic matching for lexical search: words of 3+ letters cut to a
// 4-letter stem, so «доставка / доставки», «стоит / стоимость» or «price / pricing» match.
const STOP = new Set(["это", "как", "что", "для", "или", "есть", "мне", "вас", "нас", "так", "где", "когда", "какой", "какая", "какие", "можно", "нужно", "the", "and", "for", "you", "your", "are", "what", "how", "can", "with", "have", "this", "that", "from"]);
export function stems(value: string) {
  const out = new Set<string>();
  for (const word of value.toLowerCase().replace(/ё/g, "е").match(/[a-zа-я0-9]{3,}/gi) ?? []) if (!STOP.has(word)) out.add(word.length > 4 ? word.slice(0, 4) : word);
  return out;
}
/** Share of query stems present in the text (0..1). */
export function overlap(query: Set<string>, text: string) {
  if (!query.size) return 0;
  const candidate = stems(text);
  let hits = 0;
  for (const stem of query) if (candidate.has(stem)) hits++;
  return hits / query.size;
}
/** The most relevant blocks of a long text for a query, kept in page order, within `budget` characters. The page start is always kept. */
export function bestPassages(content: string, query: string, budget = 2500) {
  if (content.length <= budget) return content;
  const blocks = content.split(/\n{2,}|\n(?=- )/).map(block => block.trim()).filter(Boolean);
  const q = stems(query);
  const head = content.slice(0, Math.min(500, Math.floor(budget / 4)));
  const scored = blocks.map((block, index) => ({ block, index, score: overlap(q, block) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const picked: typeof scored = [];
  let used = head.length;
  for (const item of scored) { if (used + item.block.length + 2 > budget) continue; picked.push(item); used += item.block.length + 2; }
  if (!picked.length) return content.slice(0, budget);
  return [head, ...picked.sort((a, b) => a.index - b.index).map(item => item.block).filter(block => !head.includes(block))].join("\n\n").slice(0, budget);
}
