# Switch Check

Type what you want a model to do. Watch several models do it. Get told which one to use, and see why.

Live page: https://switch-check.vercel.app · The first version, kept as it was: https://switch-check-v1.vercel.app · What changed and why: `/what-changed` on the page.

## What it does

You type a task in plain words, pick up to four models and the one you use today, and press **Check**. The page starts with two, Claude Sonnet 5.5 and Claude Haiku 5.5: every call goes only to zero-data-retention endpoints, and under that rule these two answered fastest (10 of 10 calls in about a second each, where GPT-6 Luna took over 15 s on 3 of 10; `docs/model-connection.md` section 6e). GPT-6 Luna, Claude Opus 5.5 and GPT-6 Sol can be added. DeepSeek V4.1 Flash is not offered for now, because at its listed price it has no zero-data-retention endpoint above 4-bit. Then, with no further input:

1. **Writing.** One model (Gemini 3.8 Flash) turns your words into a prompt with one input slot, three test cases and three to five yes or no checks. The checks are written before any model has answered. The page lists what it added to your words.
2. **Running.** Every model you picked answers every test case, in parallel, through OpenRouter. Each answer is capped at 600 tokens, with a further 1,024 tokens allowed for hidden reasoning, and every model gets exactly the same prompt and the same reasoning budget. A model that fails or takes too long is **not tested**, never counted as worse.
3. **Judging.** One call to a judge model marks every answer against every check. Three judges are tried in turn, each with a short deadline of its own, so one that goes quiet costs seconds rather than the whole run: Gemini 2.5 Flash, then Gemini 3.8 Flash, then Mistral Medium 3.1, picked by measuring them on a real judge prompt (`docs/model-connection.md`). If none of them answers, the page says so, keeps the answers, leaves every check unset for you, and offers one retry that judges the same answers again without running a single model. It sees the answers as A, B, C in a shuffled order with no model name anywhere. For each fail it quotes the line that decided it, and a quote that is not a line of that answer is thrown away.
4. **Verdict.** Among the models within one check of the best, the cheapest by estimated cost per 1,000 runs is picked; ties go to the faster. That is **stay** if it is the model you use today, otherwise **switch**. It is **test more** if a model was not tested on every case, or if flipping one judged result would change the answer. The sentence is built only from numbers on the page.

Then you can flip any check, edit any test case and run again, and the verdict follows. The page also runs your words exactly as typed on the recommended model against the written prompt with the same checks, and offers a prompt shaped for that model (not tested until you press Test it).

A task too large for one short answer, such as a whole app, is run as a **slice**: the page says which part it tested and what it did not.

## What is real and what is not

Every figure has a state under it, in the same place every time.

| State | Meaning |
| --- | --- |
| measured | timed by the server during this run, after the whole answer was read |
| estimated | a published OpenRouter price (with its check date) times the tokens the API reported |
| generated | written by a model before any answer existed: the prompt, the test cases, the checks |
| judged | marked by the judge, or set by you (marked with `*`) |
| recorded | taken from a saved run. Measured times in a recording read recorded. |

A test fails if a figure can be drawn without a state (`scripts/lib/figure.test.mjs`). The three **recorded examples** (`demo-data/examples/`) are real runs made once by `npm run record-examples` and are labelled with their date wherever a live run would say "this run". They are what the page shows when the daily limit is reached or the provider is down.

What the page cannot show: the judge is a model, so it can be wrong or lenient, which is why every result is a control you can flip. Three test cases is enough to point, not to prove, and the page says so under every verdict. Reasoning cannot be switched off for every model, so instead it is given a budget of its own, the same for all of them; the tokens it uses are charged like any other output and are inside the cost figure. A model that spends its whole allowance thinking and writes nothing is reported as not tested, with that reason in plain words. That still happens: in the recorded time tracker, one follow-up reads exactly that.

## Spending limits

A credit limit of **$25** is set on the model key in the OpenRouter dashboard (dated in `docs/model-connection.md`). In the app: 5 checks per visitor and 30 for the whole site per UTC day, counted before any model is called; at most 4 models, exactly 3 test cases, 600 answer tokens plus 1,024 reasoning tokens per call, 2,000 characters of task; a finished check is served again for 24 hours without a new run. At the worst the caps allow, one check is about $0.68, so a day of 30 costs at most about $21 (prices of 2026-10-15). These figures are not kept by hand: they come from the caps in `lib/limits.ts` and the prices in `config/model-prices.json`, and `scripts/lib/models.test.mjs` recomputes them and fails if a worst-case day could reach the $25 limit. The breakdown is in `docs/model-connection.md`. If the store behind the counts cannot be reached, live checks stop and the recorded examples are offered.

## Privacy

The page says this next to the Check button, before the first run (`privacyNotice()` in `lib/limits.ts`):

> Your task, the test cases and the answers go through OpenRouter to the model providers, and only to endpoints OpenRouter lists as zero data retention. OpenRouter does not log them for this app. This app keeps a finished check for 24 hours so you can see it again without paying twice; only you can see it. Follow-ups are kept 60 minutes. Your address is not stored by this app, only a keyed hash for the day's count; the hosting platform keeps its own short request logs. Please don't paste passwords or anything you would not put in an email.

How each part holds: every model call is sent with `zdr: true` and its listed price as a cap, and a model with no such endpoint is reported as not tested rather than sent elsewhere; `npm run check-models` fails if any model has none. A finished check is cached under a key that includes a keyed hash of the visitor, so it is never shown to anyone else. The OpenRouter account's logging and training settings, read on 2026-10-15, are in `docs/model-connection.md` section 6d.

## Run it

```bash
npm install
cp .env.example .env.local   # add your OpenRouter key; .env.local is git-ignored
npm run dev                  # http://localhost:3000
npm test                     # pure logic and the server flow, with a fake model, no network
npm run check-models         # re-reads OpenRouter's prices and zero-data-retention endpoints into config/ and docs/models-checked.md
npm run record-examples      # re-records the three examples (spends a few cents)
```

Without a store attached, development uses memory for the limits. In production the four `KV_*` and `REDIS_URL` values come from the Vercel store.

## Layout

| Where | What |
| --- | --- |
| `app/` | The one page and `/what-changed`. View state only. |
| `app/api/` | `check` (the run), `followup` (your words, shaped prompt, Test it), `status` (what is left today). Thin: they read the request and write the response. |
| `lib/` | Pure, tested logic: the verdict rule, figures with states, cost and speed, the blind judge, request checks, the event stream. |
| `lib/server/` | The model call, prompt writer, judge, pipeline, store, limits, cache, tickets. Never imported by client code (a test checks it). |
| `config/` | Candidate models and dated prices. |
| `demo-data/examples/` | The recorded examples. |

## Using AI in this project

The code was written with AI coding help and the models above are called at run time. The daily posts and replies about this project are written by hand.
