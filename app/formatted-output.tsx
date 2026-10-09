import { formatOutput, type FlatBlock, type Span } from "@/lib/output-format";

// A model's answer shown as formatted text. Every piece is built as an
// element from the blocks of lib/output-format.ts, and the text goes in as
// text, so nothing in an answer is ever read as markup.

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, index) =>
        span.bold ? (
          <strong key={index} className="font-semibold">
            {span.text}
          </strong>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </>
  );
}

function Flat({ block }: { block: FlatBlock }) {
  if (block.kind === "paragraph") {
    return (
      <p className="mb-[0.8em] last:mb-0 [overflow-wrap:anywhere]">
        <Spans spans={block.spans} />
      </p>
    );
  }
  return (
    <div className="mb-[0.5em] grid grid-cols-[1.6em_minmax(0,1fr)] last:mb-0">
      <span aria-hidden={block.kind === "bulleted"} className="text-muted">
        {block.kind === "numbered" ? block.marker : "•"}
      </span>
      <div className="[overflow-wrap:anywhere]">
        <Spans spans={block.spans} />
      </div>
    </div>
  );
}

export function FormattedOutput({ text }: { text: string }) {
  return (
    <div className="max-w-[72ch] text-[15.5px] leading-[1.65]">
      {formatOutput(text).map((block, index) =>
        block.kind === "code" ? (
          <pre key={index} className="mb-[0.8em] overflow-x-auto rounded-xl bg-chip px-3.5 py-2.5 font-mono text-[12.5px] leading-[1.6] last:mb-0" tabIndex={0}>
            <code>{block.text}</code>
          </pre>
        ) : block.kind === "quote" ? (
          <blockquote key={index} className="mb-[0.8em] rounded-xl bg-chip px-3.5 py-2.5 last:mb-0">
            {block.blocks.map((inner, innerIndex) => (
              <Flat key={innerIndex} block={inner} />
            ))}
          </blockquote>
        ) : (
          <Flat key={index} block={block} />
        ),
      )}
    </div>
  );
}

// The same text, character for character as stored, in the mono face.
export function RawOutput({ text }: { text: string }) {
  return (
    <pre className="max-w-[72ch] whitespace-pre-wrap font-mono text-[13px] leading-[1.6] [overflow-wrap:anywhere]">
      {text}
    </pre>
  );
}
