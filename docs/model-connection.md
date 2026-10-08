# Model connection

Decided on 2026-10-08 (Day 14). This note records how Switch Check will reach
the two models it compares, the limits on a run, and what was checked for
exposed keys. Nothing in it is built yet: today the app calls no model.

## 1. The decision

Switch Check will call both models through OpenRouter. The calls will be made
from the server, with one API key held in the server environment variable
`OPENROUTER_API_KEY`. The key is never sent to the browser.

Pasting outputs by hand stays as the fallback. It is the only path that
exists today, and it remains for any output the app could not get itself.

The key is the project owner's, so her OpenRouter account pays for testers'
runs.

## 2. Why OpenRouter

- **The candidate list and the prices already come from there.**
  `npm run check-models` reads OpenRouter's public model list and writes
  [`models-checked.md`](models-checked.md). The candidate ids are in
  [`config/candidates.json`](../config/candidates.json).
- **The sample run already went through it.** The run of 2026-10-03 made six
  calls and all six answered. The outputs, token counts and response times are
  in
  [`demo-data/sample-results-2026-10-03.json`](../demo-data/sample-results-2026-10-03.json).
  That run was made by a script on one computer
  ([`scripts/run-sample.mjs`](../scripts/run-sample.mjs)), not by the app.
- **One key and one request format cover both providers.** The script sends
  the same request to an Anthropic model and an OpenAI model and changes only
  the model id ([`scripts/lib/sample-run.mjs`](../scripts/lib/sample-run.mjs)).
- **A test is cheap at these prices.** One complete test of the default pair
  costs about $0.012 (section 5).

## 3. What was considered and not chosen

- **Calling each provider directly.** Two keys, two request formats and two
  price sources to keep in step.
- **Each tester brings their own key.** A tester would need an OpenRouter
  account and would have to type a key into someone else's site. The goal is
  completed tests, and both of those are reasons to stop before finishing one.
- **Paste-only.** It works today and it stays. But the person has to run both
  models themselves, six times, before there is anything to compare.

## 4. Prices

Checked on 2026-10-08 against OpenRouter's live model list
(https://openrouter.ai/api/v1/models). Prices are US dollars per million
tokens, as published by OpenRouter.

| Model id | Input / 1M tokens | Output / 1M tokens | Checked |
| --- | --- | --- | --- |
| `openai/gpt-6-sol` | $2.00 | $10.00 | 2026-10-08 |
| `openai/gpt-6-luna` | $0.10 | $0.50 | 2026-10-08 |
| `anthropic/claude-opus-5.5` | $4.00 | $20.00 | 2026-10-08 |
| `anthropic/claude-sonnet-5.5` | $2.00 | $10.00 | 2026-10-08 |

Prices change. The date is part of the number, and `npm run check-models`
re-reads them and rewrites [`models-checked.md`](models-checked.md).

## 5. What one test costs

One test is six calls: two models on three inputs. For the default pair this
is an **estimate of about $0.012**, from the prices checked on 2026-10-08 and
the tokens the sample run of 2026-10-03 used.

| Model | Input tokens (3 calls) | Output tokens (3 calls) | Cost |
| --- | --- | --- | --- |
| `anthropic/claude-sonnet-5.5` | 696 | 1,036 | 696 × $2.00 / 1M + 1,036 × $10.00 / 1M = $0.011752 |
| `openai/gpt-6-luna` | 454 | 512 | 454 × $0.10 / 1M + 512 × $0.50 / 1M = $0.000301 |
| Both | | | $0.012053 |

It is an estimate and not a bill: the tokens are from one run of one made-up
workflow, and another prompt or longer inputs will use more.

## 6. Model access, checked today

`npm run check-models` was run on 2026-10-08. OpenRouter lists **4 of the 4
candidates**. **No price differs** from the check of 2026-09-28. Only the
date in [`models-checked.md`](models-checked.md) changed.

The check reads a public list. It shows that the models are offered and at
what price. It does not make a call, so it does not show that the key may use
each model. The last evidence for that is the sample run of 2026-10-03, for
the default pair only.

What happens if a model is missing:

- **Today.** The app calls nothing. The pickers offer the ids in
  `config/candidates.json`. `npm run check-models` marks an id that is not on
  OpenRouter's list as NOT LISTED and exits with an error.
- **From Day 15, when the app is planned to run models.** A call that fails,
  times out or returns no text is shown as `not tested` with the reason, never
  as a worse output. The other cells still finish. The person can paste that
  output by hand. This is the rule `scripts/run-sample.mjs` already follows.

## 7. Limits

These are decided here and planned for Day 15. None is built yet.

| Limit | Value | Why |
| --- | --- | --- |
| Models | exactly two per test, picked from the ids in `config/candidates.json` | the goal is a two-model comparison |
| Inputs | three, up to 4,000 characters each | already enforced by the form |
| Calls per test | six (two models × three inputs), single turn, text only | |
| Output length | 600 tokens per call | the value the sample run of 2026-10-03 used |
| Wait per call | 45 seconds, then `not tested` | from the plan for Day 15 |
| Spending | a credit limit of $5 set on the key in OpenRouter | the one limit that holds even if the app's own checks fail |

The $5 credit limit is set by hand in the OpenRouter dashboard. It was not
set or verified as part of this note.

Limits of the path itself:

- Only models that OpenRouter lists can be compared.
- One prompt and one answer per call. No chats, images or files.
- Prices are a dated reading and can change.
- Response times vary from run to run.

**Worst case for one test, an estimate of about $0.08.** The two most
expensive candidates at the prices checked on 2026-10-08, with 600 output
tokens on every call. **Assumption:** about 1,500 input tokens per call, for
a full-length input plus the prompt.

| Model | Per call | Three calls |
| --- | --- | --- |
| `anthropic/claude-opus-5.5` | 1,500 × $4.00 / 1M + 600 × $20.00 / 1M = $0.018 | $0.054 |
| `openai/gpt-6-sol` | 1,500 × $2.00 / 1M + 600 × $10.00 / 1M = $0.009 | $0.027 |
| Both | | $0.081 |

At that rate $5 covers about 60 worst-case tests ($5 / $0.081 = 61).

## 8. Credentials

Checked on 2026-10-08. Each line is what the check found, not what is
intended. The searches look for `sk-or-`, the start of every OpenRouter key,
and separately for the exact value of the local key. The exact value was
compared by the tools and was never printed.

| Check | Found |
| --- | --- |
| `.env.local` is ignored by git | Yes, by the `.env*` rule in `.gitignore`. `.env.example` is the only tracked env file. |
| `.env.local` was never committed | `git log --all --full-history -- .env.local` is empty, across all 13 commits and every branch. No other `.env` file is in the history. |
| No key in any tracked file | The exact key: 0 files. The string `sk-or-`: 1 file, `scripts/lib/sample-results.test.mjs`, where those six characters are the pattern of a test that fails if a key is saved in the results. Nothing follows them. It is not a key. |
| No key anywhere in the history | `git log -p --all`: the exact key 0 times, `sk-or-` once, in the same test line. No commit message contains it. |
| No `NEXT_PUBLIC_` variable holds a key | No tracked file names a `NEXT_PUBLIC_` variable, and `.env.local` holds one variable, `OPENROUTER_API_KEY`. |
| The key is not read by the app | `OPENROUTER_API_KEY` is read in one place, `scripts/run-sample.mjs`, a script run by hand. Nothing under `app/` or `lib/` reads an environment variable. |
| The built site does not contain it | After `npm run build`, `sk-or-`, the name `OPENROUTER_API_KEY` and the exact key each appear in 0 of the 23 files in `.next/static`. The exact key is in 0 files of the whole `.next` folder. |
| `.env.example` has the name and no value | The line reads `OPENROUTER_API_KEY=` with nothing after it. |
| The saved results contain no key | 0 matches in both files in `demo-data/`, for `sk-or-`, the exact key and the word `Bearer`. |
| This note and the other notes contain no key | 0 matches for the exact key in this file, in the two untracked files in this folder, and in the planning notes kept outside this repository. |

The searches were shown to be able to find a key: the local key does start
with `sk-or-`, so a copy of it in any searched place would have matched.

Not covered by these checks: the key's settings in the OpenRouter dashboard,
and any hosting environment. There is no deployment yet.

## 9. Not decided yet

- A cap on tests per person or per day.
- What the page tells a person before their prompt and inputs are sent to
  OpenRouter and on to the model's provider.

Day 15 and Day 21 take these.
