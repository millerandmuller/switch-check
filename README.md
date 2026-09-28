# Switch Check

Compare two AI models on your own prompt and inputs, then decide: switch, stay, or test more. See `SPEC.md`.

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your OpenRouter key; .env.local is git-ignored
npm run dev
```

## Check candidate model prices

```bash
npm run check-models   # reads OpenRouter's live list, writes docs/models-checked.md
npm test
```

Candidate model ids live in `config/candidates.json`.
