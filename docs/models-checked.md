# Models checked

Checked on 2026-10-15 against OpenRouter's live model list (https://openrouter.ai/api/v1/models).
Prices are USD per million tokens, as published by OpenRouter. Regenerate with `npm run check-models`.
Zero-data-retention endpoints at or under the listed price, from https://openrouter.ai/api/v1/endpoints/zdr on 2026-10-15. Every call is sent with `zdr: true` and the listed price as its cap, so a model marked NONE could not be called.

| Model id | Name | Input / 1M tokens | Output / 1M tokens | Context (tokens) | ZDR endpoints at listed price | Checked |
| --- | --- | --- | --- | --- | --- | --- |
| `anthropic/claude-haiku-5.5` | Anthropic: Claude Haiku 5.5 | $0.10 | $0.50 | 1,000,000 | google-vertex/global, amazon-bedrock | 2026-10-15 |
| `anthropic/claude-sonnet-5.5` | Anthropic: Claude Sonnet 5.5 | $2.00 | $10.00 | 1,000,000 | google-vertex/global, amazon-bedrock | 2026-10-15 |
| `anthropic/claude-opus-5.5` | Anthropic: Claude Opus 5.5 | $4.00 | $20.00 | 1,000,000 | amazon-bedrock, google-vertex/global | 2026-10-15 |
| `openai/gpt-6-luna` | OpenAI: GPT-6 Luna | $0.10 | $0.50 | 1,050,000 | azure | 2026-10-15 |
| `openai/gpt-6-sol` | OpenAI: GPT-6 Sol | $2.00 | $10.00 | 1,050,000 | azure | 2026-10-15 |
| `deepseek/deepseek-v4.1-flash` | DeepSeek: DeepSeek V4.1 Flash | $0.02 | $0.72 | 1,048,576 | open-inference/fp4 | 2026-10-15 |
| `google/gemini-3.8-flash` | Google: Gemini 3.8 Flash | $0.75 | $3.75 | 1,048,576 | google-vertex/global | 2026-10-15 |
| `google/gemini-2.5-flash` | Google: Gemini 2.5 Flash | $0.30 | $2.50 | 1,048,576 | google-vertex/eu, google-vertex/global, google-vertex | 2026-10-15 |
| `mistralai/mistral-medium-3.1` | Mistral: Mistral Medium 3.1 | $0.40 | $2.00 | 131,072 | mistral/zdr | 2026-10-15 |
