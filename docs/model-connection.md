# Model connection

First written 2026-10-08 (Day 14) as a plan. Rewritten 2026-10-09 (Day 15) now
that it is built, and the settings, costs and caps were recomputed later the
same day once hidden reasoning was given its own billed allowance. It records
how Switch Check reaches the models, the limits on a run, what the limits cost
at worst, and what was checked for exposed keys.

## 1. How it works

Every model call goes through OpenRouter, from the server, with one key held in
the server environment variable `OPENROUTER_API_KEY`. The key is read in one
place (`lib/server/services.ts`), passed to `lib/server/openrouter.ts`, and
travels only in the `Authorization` header. It is never sent to the browser. A
test fails if client code mentions it or any server file.

Calls made per full check (up to): 1 writer, up to 12 candidate calls (4 models
by 3 test cases), 1 judge (a second only if the first fails), then, once the
verdict is in, 3 calls and 1 judge for "your words as typed", 1 writer call for
the shaped prompt, and 3 calls and 1 judge if the person presses Test it.

Models: the candidates, the writer and the judges are in
`config/candidates.json`; every one has a dated price in
`config/model-prices.json`, written by `npm run check-models` (last run
2026-10-09, 8 of 8 listed). Candidates: Claude Haiku 5.5, Sonnet 5.5, Opus 5.5,
GPT-6 Luna, GPT-6 Sol, DeepSeek V4.1 Flash. Writer: Gemini 3.8 Flash. Judges, in
order: Gemini 3.8 Flash, Grok 4.7. A test checks the two files agree.

## 2. Settings that were found by trying, 2026-10-09

- **Reasoning gets its own allowance, asked for as a budget.** Every call sends
  `reasoning: { max_tokens: 1024, exclude: true }` with `max_tokens` set to the
  call's own allowance plus that 1,024. The same request for every model keeps
  the comparison fair.
- **An effort is a hint; only a budget bounds anything.** With
  `effort: low` and one 600-token cap covering thinking and answer together,
  DeepSeek V4.1 Flash spent 600 of 600 tokens thinking and returned nothing,
  then 1,624 of 1,624 and returned nothing again. Under a 1,024-token budget
  the same model stopped at 873 and answered. Measured on one logic puzzle
  against all six models plus both helpers.
- **`effort: none` is not available.** `GET /api/v1/models` reports per model
  `{ mandatory, default_enabled, supported_efforts, default_effort }`. Sonnet
  5.5, Gemini 3.8 Flash and Grok 4.7 are `mandatory: true` and reject it; only
  GPT-6 Luna lists `none` among its efforts. The earlier note that
  `enabled: false` is refused by four of the eight models still holds.
- **1,024 is the floor for the budget, not a choice.** It is Anthropic's
  minimum, and Anthropic requires `max_tokens` strictly above the budget, so a
  600-token cap with any reasoning request was already malformed for Claude.
- **The budget is not honoured everywhere.** OpenRouter converts a budget to an
  effort for a model that advertises efforts only, which puts the cap back out
  of reach: in the re-recorded time-tracker example, Claude Haiku 5.5 spent all
  1,624 tokens thinking on the "your words as typed" follow-up, whose prompt is
  the person's own text with no instruction to be brief. Grok 4.7 was measured
  at 1,117 against a 1,024 budget. Such a cell is "not tested" and says where
  the tokens went. This is reduced, not solved.
- **Reasoning tokens are billed as output** and are already inside
  `usage.completion_tokens`, with the breakdown at
  `usage.completion_tokens_details.reasoning_tokens`. The cost figure uses
  `completion_tokens`, so hidden thinking is paid for in what the page shows.
- **Time is read after the whole body.** OpenRouter can send headers before the
  model finishes, so a clock stopped at the headers under-counted by two to
  three times.
- **Judge speed, and its tail.** Gemini 3.8 Flash: 2.7 to 4.7 s for nine to
  twelve answers, but on the same prompt replayed four times it returned in
  2.8, 2.9, 3.7 and 12.2 s, and once took 46 s and timed out. Grok 4.7 and 4.6:
  12 to 16 s. Gemini 3.7 Flash was quicker still but marked a deliberately
  flawed check as passed for every answer, so it was not used. One attempt may
  now use only its share of the judging time, so a stall like that leaves the
  second judge its own, and if both fail the checks are there unset to set.

## 3. Prices

Checked on 2026-10-09 against https://openrouter.ai/api/v1/models, in US
dollars per million tokens. See `docs/models-checked.md` for the table. They
change; the date is part of every cost figure on the page.

## 4. Limits

All are constants in `lib/limits.ts`, each with a test.

| Limit | Value |
| --- | --- |
| Models per run | 2 to 4, from the candidate list |
| Test cases | exactly 3, up to 1,200 characters each |
| Checks | 3 to 5 |
| Task | 2,000 characters |
| Answer per candidate call | 600 tokens |
| Hidden reasoning per call | 1,024 tokens on top, billed as output |
| Asked of the provider per candidate call | 1,624 tokens (`max_tokens`) |
| Writer / judge output | 3,000 / 4,000 tokens, plus the same 1,024 |
| Wait per call | 45 seconds, then "not tested" |
| Route | 60 seconds total; the run plans for 55 |
| Share of those 55 seconds | writing 25, the model calls 18, judging 12, each starting when its step starts and also getting what earlier steps left |
| Share of the judging time per attempt | its own fraction of what is left, so the second judge keeps its own |
| Checks per visitor per UTC day | 5 |
| Checks for the whole site per UTC day | 30 |
| A finished check, same task and same models | served again for 24 hours, no new run, no check spent |
| Follow-ups of a check | each of the three once, only with a ticket from a finished live check, kept 1 hour |

A visitor is a keyed hash of their address; the address is not stored. If the
store behind the counts cannot be reached, or no key is set, live checks are
refused and the three recorded examples are offered. "Run again" counts as a
check.

The route time of 60 seconds is what `maxDuration` asks for, and the plan
covers it with room to spare: the project is on **Pro**, and with fluid compute
a function's default limit is 300 s and its maximum 800 s (Vercel's duration
documentation, read 2026-10-09). A normal check took 9 to 30 seconds.

## 5. The spending limit, recomputed 2026-10-09

Read from OpenRouter itself (`GET /api/v1/key`): the key has a credit **limit
of $25**, with no reset, **$1.04 used** and **$23.96 left** after all the
testing of this build (the live runs, the reasoning probes and three
re-recordings). The limit is the one that holds even if the app's own checks
fail.

**Worst case for one full check: about $0.76**, up from $0.42, because hidden
reasoning is billed as output on top of each call's own allowance. The bound
counts, per call, 1,624 output tokens for a candidate, 4,024 for the writer and
5,024 for a judge. It assumes the four most expensive candidates answering
every case at the cap, both judges running, the person pressing Test it, and
input at 3 characters per token, which over-counts. The parts: the twelve
candidate calls $0.244, the writer $0.016, both judges $0.112, "your words" and
its judges $0.185, the shaped prompt $0.016, Test it and its judges $0.185.

**$25 pays for 32 worst-case checks.** A day of 40 would have been **$30.33**,
over the limit, so **the site cap was lowered from 40 to 30 a day** ($22.75 at
worst). The per-visitor cap stays at 5, which is $3.79 at worst for one person.
A test (`scripts/lib/models.test.mjs`) recomputes all of this from the caps and
the shipped prices and fails if a day could reach the limit.

**Typical is far below the worst case.** Three live open-ended checks on the
three default models, measured call by call at the shipped prices: $0.0218,
$0.0094 and $0.0189, mean **$0.017** for the writing, the nine candidate calls
and the judge. The follow-ups roughly double that when a person uses them.

Worth watching: a single worst-case day of 30 checks ($22.75) is nearly the
whole $23.96 left on the key. The cap is right against the $25 limit, but the
balance, not the limit, is what runs out first.

## 6. Credentials, checked 2026-10-09 (rerun before the first deploy)

Each line is what the check found. The exact key was compared by the tools and
never printed. The key starts with the OpenRouter prefix, so a copy of it in any
searched place would also have matched the prefix search.

| Check | Found |
| --- | --- |
| `.env.local` is ignored by git | Yes, by the `.env*` rule. `.env.example` is the only env file tracked, with names and no values. |
| `.env.local` was never committed | `git log --all --full-history -- .env.local` is empty. |
| No key in any tracked file | The exact key: 0 files. The OpenRouter key prefix: 1 file, this note, where it describes the check. |
| No key in the history | `git log -p --all`: the exact key 0 times. |
| No `NEXT_PUBLIC_` variable | 0 matches in `app`, `lib`, `config`, `scripts` and `.env.example`. |
| The built site does not contain it | After `npm run build`: the exact key, the key prefix and the variable name each appear in 0 of the 24 files in `.next/static`, and the exact key in 0 files of the whole `.next` folder. |
| The recorded examples contain no key | 0 matches for `Bearer` and the prefix in all three files. |
| The key is read in one place | `lib/server/services.ts`, checked by `scripts/lib/server-boundary.test.mjs`. |
| The deployed page does not contain it | On the preview deployment: 8 scripts and 617 KB of served JavaScript scanned, plus the HTML. The key shape, a bearer token and the variable name each appear 0 times. |

Each of those searches was run with a control that finds something, so a zero
means the search looked rather than that it failed. Example: the same search
over tracked files finds the word "OpenRouter" in 11 of them.

On Vercel: `OPENROUTER_API_KEY` is set for Production only; the four `KV_*`
values and `REDIS_URL` are set for Production, Preview and Development
(`vercel env ls`, names only, 2026-10-09). A preview therefore reports
`keyed: false` and offers the recorded examples instead of running live, which
is what the first preview showed. **Not checked:** anything in the provider
dashboards beyond the key limit above, and the production deployment itself.
This must be rerun and dated before each deploy.

## 6a. What the first preview deployment showed, 2026-10-09

| Check | Result |
| --- | --- |
| Function time limit | Pro plan, 300 s default and 800 s maximum, against the 60 s the route asks for and the 55 s it plans to use. |
| Per-visitor cap | Proved on the deployment: 5 checks accepted, the 6th refused with 429 and "Your free checks for today are used up", and `visitorLeft` went 5 to 0. A refused check costs nothing: the site count stayed where it was, because the visitor's count is taken first. |
| Daily site cap | Not proved end to end. Seeing it stop a run means spending a whole day of 30. The code path is the same one the visitor cap proved, and `scripts/lib/guard.test.mjs` exhausts both. |
| Page at phone width | 384 px wide: one column, nothing clipped, and `scrollWidth` equals `clientWidth`, so there is no sideways scroll. The caps and the reasoning allowance read correctly in the notice. |
| Recorded examples | The re-recorded time tracker loads, says "Recorded on", and shows the verdict and the "Cut off at the token limit" chip. |

Two things this turned up, both since fixed.

- **The counts were shared.** The limit keys carried no environment name, and
  Preview and Production use one store, so five checks run on a preview came
  off the live site's day. The keys are now `limit:<environment>:site:<day>`
  and `limit:<environment>:v:<day>:<visitor>`, with the environment taken from
  `VERCEL_ENV` (`limitScope` in `lib/server/services.ts`). A test in
  `scripts/lib/guard.test.mjs` spends a preview visitor's whole allowance and
  then checks the live site's is untouched, in the same store. Changing the
  key shape starts both counts from zero once, which is why the live site has
  its full day back.
- **The visitor hash depended on the model key.** `limitSecret` falls back to
  the model key when `LIMIT_SALT` is empty, so the two environments disagreed
  about who a visitor was and rotating the key would have reset everyone's
  day. `LIMIT_SALT` is now set for Production and for Preview, a different
  freshly generated 64-character value in each, encrypted, and never written
  anywhere outside Vercel. A test pins the precedence: with a salt set, the
  same address keeps the same id across two different model keys; without one,
  it does not.

Still shared on purpose, and worth deciding on: the cache of finished runs
(`cache:<version>:<hash>`) and the follow-up tickets have no environment name,
so a run finished on a preview can be served to the live site when someone
asks the very same task with the very same models inside 24 hours. Nothing has
been served that way (the probe tasks all carried a timestamp, so no one will
ever ask for them), but the path is open.

## 7. Not decided yet

- Whether to raise the limits once real use is seen.
- Whether a command-line or agent entry point should sit on the same route.
