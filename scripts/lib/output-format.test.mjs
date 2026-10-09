// Tests for turning a model's answer into blocks for reading, including the
// six saved sample outputs. The formatter must never touch the stored text and
// never lose a word of it.
import test from "node:test";
import assert from "node:assert/strict";
import { formatOutput, spansOf } from "../../lib/output-format.ts";
import { EXAMPLES } from "../../lib/examples.ts";

// The answers of the three recorded examples: real model output, with bold
// marks, numbered lists, quotes and fenced code.
async function savedOutputs() {
  return EXAMPLES.flatMap((example) =>
    example.events
      .filter((event) => event.type === "cell" && event.cell.status === "answered")
      .map((event) => ({ label: `${example.id} / ${event.modelId} / ${event.testCaseId}`, text: event.cell.text })),
  );
}

// Every piece of visible text of a block, in order.
function visibleText(blocks) {
  return blocks
    .flatMap((block) =>
      block.kind === "code"
        ? [block.text]
        : block.kind === "quote"
          ? [visibleText(block.blocks)]
          : [(block.marker ? `${block.marker} ` : "") + block.spans.map((span) => span.text).join("")],
    )
    .join("\n");
}

// The same, with code blocks left out. Code is shown exactly as returned, so a
// `/**` opening a JSDoc comment is text the formatter must not touch, and only
// prose may be checked for leftover bold marks.
function proseText(blocks) {
  return blocks
    .flatMap((block) =>
      block.kind === "code"
        ? []
        : block.kind === "quote"
          ? [proseText(block.blocks)]
          : [block.spans.map((span) => span.text).join("")],
    )
    .join("\n");
}

// The words of a text with the formatting marks taken out.
function words(text) {
  return text
    .replace(/^\s*```\S*\s*$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(\d+\.|-)\s+/gm, "")
    .split(/\s+/)
    .filter(Boolean);
}

test("the recorded examples hold real answers to format", async () => {
  assert.ok((await savedOutputs()).length >= 27);
});

test("each recorded answer reads as formatted text and loses no word", async () => {
  for (const { label, text } of await savedOutputs()) {
    const blocks = formatOutput(text);
    assert.ok(blocks.length > 0, `${label}: no blocks`);
    const shown = visibleText(blocks);
    assert.ok(!proseText(blocks).includes("**"), `${label}: a ** mark is still shown in prose`);
    assert.ok(formatOutput("A **bold** word").some((b) => b.spans?.some((s) => s.bold)), "the bold check would pass on nothing");
    // The marker of a numbered item is shown, so compare without markers.
    assert.deepEqual(words(shown), words(text), `${label}: words differ`);
  }
});

test("a bold label inside a numbered item gives a numbered block with a bold span", () => {
  const [first] = formatOutput("1. **Priority:** Urgent");
  assert.equal(first.kind, "numbered");
  assert.equal(first.marker, "1.");
  assert.deepEqual(first.spans, [
    { text: "Priority:", bold: true },
    { text: " Urgent", bold: false },
  ]);
});

test("a number before the bold pair gives the same item", () => {
  const [item] = formatOutput("1. **Priority:** Urgent  ");
  assert.deepEqual(item, {
    kind: "numbered",
    marker: "1.",
    spans: [
      { text: "Priority:", bold: true },
      { text: " Urgent", bold: false },
    ],
  });
});

test("dash lines are bulleted items and quote lines group into one quote", () => {
  const blocks = formatOutput("Intro:\n- one\n- two\n\n> Subject: Hi\n>\n> Body");
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["paragraph", "bulleted", "bulleted", "quote"],
  );
  const quote = blocks[3];
  assert.deepEqual(
    quote.blocks.map((block) => visibleText([block])),
    ["Subject: Hi", "Body"],
  );
});

test("a quote ends at the first line that is not quoted", () => {
  const blocks = formatOutput("> quoted\nnot quoted\n> quoted again");
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["quote", "paragraph", "quote"],
  );
});

test("unbalanced ** stays as written", () => {
  assert.deepEqual(spansOf("a **b and c"), [{ text: "a **b and c", bold: false }]);
  assert.deepEqual(spansOf("a ** b ** c"), [{ text: "a ** b ** c", bold: false }]);
  assert.deepEqual(spansOf("**a** and **b"), [
    { text: "a", bold: true },
    { text: " and **b", bold: false },
  ]);
  const [line] = formatOutput("**1. Priority without a closing pair");
  assert.equal(line.kind, "paragraph");
  assert.equal(visibleText([line]), "**1. Priority without a closing pair");
});

test("lines that only look like a list are plain paragraphs", () => {
  for (const text of ["-5 degrees", "1.5 million", "2026", "1.", "- ", "-", "3.14 is pi", "a - b"]) {
    const blocks = formatOutput(text);
    if (text.trim() === "" || text === "1." || text === "-") {
      // Nothing follows the mark, so there is no item.
      assert.ok(blocks.every((block) => block.kind === "paragraph"), text);
      continue;
    }
    assert.equal(blocks.length, 1, text);
    assert.equal(blocks[0].kind, "paragraph", text);
    assert.equal(visibleText(blocks), text.trimEnd(), text);
  }
});

test("an empty output has no blocks", () => {
  assert.deepEqual(formatOutput(""), []);
  assert.deepEqual(formatOutput("  \n\n \t "), []);
});

test("text with < and & comes back as the same text, never as markup", () => {
  const text = "if a < b && c > d then <script>alert(1)</script> &amp; **<b>x</b>**";
  const blocks = formatOutput(text);
  assert.equal(blocks.length, 1);
  assert.equal(visibleText(blocks), text.replace(/\*\*/g, ""));
  assert.deepEqual(blocks[0].spans.at(-1), { text: "<b>x</b>", bold: true });
});

test("windows line endings give the same blocks as plain ones", () => {
  const text = "**A:** one\n\n- two";
  assert.deepEqual(formatOutput(text.replace(/\n/g, "\r\n")), formatOutput(text));
});

test("formatting leaves the stored text alone", () => {
  const text = "**1. Priority:** Urgent\n> quote  \n- item";
  const copy = String(text);
  formatOutput(text);
  assert.equal(text, copy);
});

test("a fenced block of code is kept as written, indentation included", () => {
  const text = "Here is the schema:\n```prisma\nmodel Task {\n  id String @id\n\n  title String\n}\n```\nThat is all.";
  const blocks = formatOutput(text);
  assert.deepEqual(blocks.map((b) => b.kind), ["paragraph", "code", "paragraph"]);
  assert.equal(blocks[1].language, "prisma");
  assert.equal(blocks[1].text, "model Task {\n  id String @id\n\n  title String\n}");
});

test("a fence that is never closed, as in a cut-off answer, still shows its code", () => {
  const blocks = formatOutput("```ts\nconst a = 1;\nconst b =");
  assert.deepEqual(blocks, [{ kind: "code", language: "ts", text: "const a = 1;\nconst b =" }]);
});

test("marks inside code are not formatting", () => {
  const [block] = formatOutput("```\n**not bold**\n> not a quote\n- not a bullet\n```");
  assert.equal(block.kind, "code");
  assert.equal(block.text, "**not bold**\n> not a quote\n- not a bullet");
});

test("a fence line with text after the language is not a fence", () => {
  assert.equal(formatOutput("```ts extra words")[0].kind, "paragraph");
});

test("html inside code is text", () => {
  const [block] = formatOutput("```html\n<script>alert(1)</script>\n```");
  assert.equal(block.text, "<script>alert(1)</script>");
});
