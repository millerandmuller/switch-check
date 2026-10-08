// Turns a model's answer into blocks for reading: paragraphs, numbered and
// bulleted items, quotes, and bold spans. Pure and UI-free, and it never
// produces HTML: the page builds elements from these blocks, so nothing in an
// answer is ever interpreted as markup. Formatting is display only; the
// stored text is never changed, and the rules elsewhere read the stored text.
//
// It understands only what answers commonly contain:
//   **bold**      a pair of double asterisks around text
//   1. item       a number, a dot, a space, then text
//   - item        a dash, a space, then text
//   > quote       a greater-than sign at the start of a line
// Everything else, including a lone ** or a line like "-5 degrees", stays
// plain text exactly as written.

export type Span = { text: string; bold: boolean };

export type FlatBlock =
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "numbered"; marker: string; spans: Span[] }
  | { kind: "bulleted"; spans: Span[] };

export type Block = FlatBlock | { kind: "quote"; blocks: FlatBlock[] };

// A pair of ** with text between that neither starts nor ends in a space.
const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g;

export function spansOf(line: string): Span[] {
  const spans: Span[] = [];
  let from = 0;
  for (const match of line.matchAll(BOLD)) {
    if (match.index > from) spans.push({ text: line.slice(from, match.index), bold: false });
    spans.push({ text: match[1], bold: true });
    from = match.index + match[0].length;
  }
  if (from < line.length) spans.push({ text: line.slice(from), bold: false });
  return spans;
}

// "**1. Priority:** Urgent", "1. **Priority:** Urgent" and "1. Priority" are
// all numbered items. The first form has its marker inside the bold pair, so
// the pair is opened again around the rest of the line.
const ITEM = /^\s*(\*\*)?(\d+\.|-)\s+(\S.*)$/;

function flatBlockOf(line: string): FlatBlock {
  const match = ITEM.exec(line);
  if (match === null) return { kind: "paragraph", spans: spansOf(line) };
  const [, boldOpen, marker, rest] = match;
  // "**1. text" with no closing pair is not a bold marker: show the line as is.
  if (boldOpen !== undefined && !rest.includes("**")) {
    return { kind: "paragraph", spans: spansOf(line) };
  }
  const spans = spansOf(boldOpen === undefined ? rest : `**${rest}`);
  return marker === "-" ? { kind: "bulleted", spans } : { kind: "numbered", marker, spans };
}

const QUOTE_MARK = /^\s*>\s?/;

export function formatOutput(text: string): Block[] {
  const blocks: Block[] = [];
  let quote: FlatBlock[] | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const quoted = QUOTE_MARK.test(rawLine);
    const line = (quoted ? rawLine.replace(QUOTE_MARK, "") : rawLine).trimEnd();
    if (!quoted) quote = null;
    if (line.trim() === "") continue;
    if (quoted) {
      if (quote === null) {
        quote = [];
        blocks.push({ kind: "quote", blocks: quote });
      }
      quote.push(flatBlockOf(line));
      continue;
    }
    blocks.push(flatBlockOf(line));
  }
  return blocks;
}
