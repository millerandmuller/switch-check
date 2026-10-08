// Pure helpers for turning OpenRouter's /models payload into a price table.
// No network or file access here so it can be unit-tested.

const TOKENS_PER_MILLION = 1_000_000;

// OpenRouter reports prices as USD per single token, encoded as strings.
export function perMillion(pricePerToken) {
  const value = Number(pricePerToken);
  if (!Number.isFinite(value) || value < 0) return null;
  return Number((value * TOKENS_PER_MILLION).toPrecision(6));
}

function formatUsd(amount) {
  return amount === null ? "n/a" : `$${amount.toFixed(2)}`;
}

// Returns one row per candidate id, in candidate order. A candidate missing
// from the live list gets listed: false so the report can say so.
export function resolveCandidates(models, candidateIds) {
  const byId = new Map(models.map((model) => [model.id, model]));
  return candidateIds.map((id) => {
    const model = byId.get(id);
    if (!model) return { id, listed: false };
    return {
      id,
      listed: true,
      name: model.name,
      contextLength: model.context_length ?? null,
      inputPerMillion: perMillion(model.pricing?.prompt),
      outputPerMillion: perMillion(model.pricing?.completion),
    };
  });
}

export function renderReport(rows, { checkedOn, sourceUrl }) {
  const lines = [
    "# Models checked",
    "",
    `Checked on ${checkedOn} against OpenRouter's live model list (${sourceUrl}).`,
    "Prices are USD per million tokens, as published by OpenRouter. Regenerate with `npm run check-models`.",
    "",
    "| Model id | Name | Input / 1M tokens | Output / 1M tokens | Context (tokens) | Checked |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    if (!row.listed) {
      lines.push(`| \`${row.id}\` | NOT LISTED | n/a | n/a | n/a | ${checkedOn} |`);
      continue;
    }
    const context = row.contextLength === null ? "n/a" : row.contextLength.toLocaleString("en-US");
    lines.push(
      `| \`${row.id}\` | ${row.name} | ${formatUsd(row.inputPerMillion)} | ${formatUsd(row.outputPerMillion)} | ${context} | ${checkedOn} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// The same rows as data the app can read (config/model-prices.json). The
// report above is for people; this is for the cost estimate on the page.
// A price is never written without its source and the date it was read.
export function renderPrices(rows, { checkedOn, sourceUrl }) {
  const models = {};
  for (const row of rows) {
    models[row.id] = row.listed
      ? { listed: true, input_per_million: row.inputPerMillion, output_per_million: row.outputPerMillion }
      : { listed: false };
  }
  const file = {
    note: "Written by npm run check-models. Prices are USD per million tokens, as published by OpenRouter on the date in checked_on.",
    source_url: sourceUrl,
    checked_on: checkedOn,
    models,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
