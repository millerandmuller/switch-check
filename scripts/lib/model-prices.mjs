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

// Which zero-data-retention endpoints (OpenRouter's /endpoints/zdr) serve each
// row at or under its listed price, the cap every call is sent with. Endpoints
// with a service tier (flex, priority) are left out: OpenRouter only routes to
// them when a request opts into that tier, and these requests never do, so a
// cheap flex endpoint must not make a model look covered. Returns, per id, the
// qualifying endpoint tags; an empty list means a call to that model could
// only be refused.
export function zdrCoverage(rows, endpoints) {
  const coverage = {};
  for (const row of rows) {
    if (!row.listed || row.inputPerMillion === null || row.outputPerMillion === null) {
      coverage[row.id] = [];
      continue;
    }
    coverage[row.id] = endpoints
      .filter((endpoint) => endpoint.model_id === row.id && !endpoint.service_tier)
      .filter((endpoint) => {
        const input = perMillion(endpoint.pricing?.prompt);
        const output = perMillion(endpoint.pricing?.completion);
        return input !== null && output !== null && input <= row.inputPerMillion && output <= row.outputPerMillion;
      })
      .map((endpoint) => endpoint.tag ?? endpoint.provider_name);
  }
  return coverage;
}

// The ids no qualifying endpoint covers. check-models fails on any.
export function zdrGaps(coverage) {
  return Object.entries(coverage)
    .filter(([, tags]) => tags.length === 0)
    .map(([id]) => id);
}

function zdrCell(tags) {
  return tags.length === 0 ? "NONE" : tags.join(", ");
}

export function renderReport(rows, { checkedOn, sourceUrl }, zdr) {
  const lines = [
    "# Models checked",
    "",
    `Checked on ${checkedOn} against OpenRouter's live model list (${sourceUrl}).`,
    "Prices are USD per million tokens, as published by OpenRouter. Regenerate with `npm run check-models`.",
    `Zero-data-retention endpoints at or under the listed price, from ${zdr.sourceUrl} on ${checkedOn}. Every call is sent with \`zdr: true\` and the listed price as its cap, so a model marked NONE could not be called.`,
    "",
    "| Model id | Name | Input / 1M tokens | Output / 1M tokens | Context (tokens) | ZDR endpoints at listed price | Checked |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    if (!row.listed) {
      lines.push(`| \`${row.id}\` | NOT LISTED | n/a | n/a | n/a | NONE | ${checkedOn} |`);
      continue;
    }
    const context = row.contextLength === null ? "n/a" : row.contextLength.toLocaleString("en-US");
    lines.push(
      `| \`${row.id}\` | ${row.name} | ${formatUsd(row.inputPerMillion)} | ${formatUsd(row.outputPerMillion)} | ${context} | ${zdrCell(zdr.coverage[row.id] ?? [])} | ${checkedOn} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// The same rows as data the app can read (config/model-prices.json). The
// report above is for people; this is for the cost estimate on the page.
// A price is never written without its source and the date it was read.
export function renderPrices(rows, { checkedOn, sourceUrl }, zdr) {
  const models = {};
  for (const row of rows) {
    const zdrAtPrice = zdr.coverage[row.id] ?? [];
    models[row.id] = row.listed
      ? { listed: true, input_per_million: row.inputPerMillion, output_per_million: row.outputPerMillion, zdr_at_price: zdrAtPrice }
      : { listed: false, zdr_at_price: zdrAtPrice };
  }
  const file = {
    note: "Written by npm run check-models. Prices are USD per million tokens, as published by OpenRouter on the date in checked_on. zdr_at_price lists the zero-data-retention endpoints at or under that price, read from zdr_source_url on the same date; every call is capped at the listed price and sent only to such endpoints.",
    source_url: sourceUrl,
    zdr_source_url: zdr.sourceUrl,
    checked_on: checkedOn,
    models,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
