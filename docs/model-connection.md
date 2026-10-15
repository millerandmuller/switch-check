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
2026-10-15, 9 of 9 listed, 9 of 9 with a zero-data-retention endpoint at the
listed price, section 6d). Candidates: Claude Haiku 5.5, Sonnet 5.5, Opus 5.5,
GPT-6 Luna, GPT-6 Sol, DeepSeek V4.1 Flash. Writer: Gemini 3.8 Flash. Judges, in
the order they are tried: Gemini 2.5 Flash, Gemini 3.8 Flash, Mistral Medium
3.1 (chosen by measurement, section 2a). A test checks the two files agree.

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

## 2a. Choosing the judges by measurement, 2026-10-09

The judge was the weak point: Gemini stalled three times and one live check on
production ended after 55 seconds with no verdict at all. So five plausible
judges were each sent the same real judge prompt, rebuilt from a finished run
(3 test cases, 3 answers each, 4 checks, 36 marks), six times.

| Judge | Answered | Parsed | Median | Worst | Checks left unset |
| --- | --- | --- | --- | --- | --- |
| `google/gemini-3.8-flash` | 6 of 6 | 6 of 6 | 2.8 s | 15.8 s | 0 of 36 |
| `x-ai/grok-4.7` | 0 of 6 | 0 of 6 | 45.0 s | 45.0 s | never answered |
| `openai/gpt-5-mini` | 6 of 6 | 5 of 6 | 26.8 s | 28.6 s | 0 of 36 |
| `mistralai/mistral-medium-3.1` | 6 of 6 | 6 of 6 | 4.2 s | 4.7 s | 0 of 36 |
| `qwen/qwen3.5-122b-a10b` | 5 of 6 | 4 of 6 | 18.2 s | 45.0 s | 0 of 36 |

**Grok 4.7 never answered once**, which is why the production run died: it was
the fallback, it was given the rest of the minute, and it spent all of it. It
is out.

Three more were measured for the third seat, four calls each:
`google/gemini-2.5-flash` 4 of 4 parsed, median 8.9 s, worst 9.1 s;
`mistralai/mistral-medium-3` 4 of 4, median 4.7 s, worst 5.1 s;
`qwen/qwen3-vl-235b-a22b-instruct` 4 of 4 but median 35.1 s, too slow to fit an
attempt cap.

Speed is not enough on its own, so each finalist was also given one answer
broken on purpose: a priority outside the three allowed words, and a reply of
154 words against a 75-word limit. Both checks must fail.

| Judge | Priority check | Length check |
| --- | --- | --- |
| `google/gemini-2.5-flash` | failed it, twice | failed it, twice |
| `google/gemini-3.8-flash` | failed it | failed it (one reply of the two did not parse) |
| `mistralai/mistral-medium-3.1` | failed it, twice | **passed it, twice** |
| `mistralai/mistral-medium-3` | failed it, twice | **passed it, twice** |

The Mistral models are the fastest and steadiest of the lot and cannot count
words. That decides the order: **Gemini 2.5 Flash** first (marked everything
correctly, never above 9.1 s), **Gemini 3.8 Flash** second (the quickest
median, strict, with a long tail the attempt cap now cuts), **Mistral Medium
3.1** third, kept because it is the only one from a provider that is not
Google and it will still answer when Google will not. Its leniency on counting
is the reason it is third and not first.

Left open: the first two share a provider. A single Google outage falls through
to a judge that cannot count lengths. No fast, strict judge from a third
provider turned up in this round.

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
| Share of the judging time per attempt | the shorter of its own fraction of what is left and a flat 12 s, so a judge that goes quiet is dropped early and the judges after it keep their turn |
| Judges tried per run | 3, in order, one attempt each |
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

**Worst case for one full check: about $0.69.** It was $0.42 before hidden
reasoning got its own billed allowance, rose to $0.76 with it, and came back
down when Grok 4.7 was dropped: three cheaper judges cost less than the two
before them. The bound counts, per call, 1,624 output tokens for a candidate,
4,024 for the writer and 5,024 for a judge. It assumes the four most expensive
candidates answering every case at the cap, every judge running, the person
pressing Test it, and input at 3 characters per token, which over-counts. The
parts: the twelve candidate calls $0.244, the writer $0.016, all three judges
$0.075, "your words" and its judges $0.169, the shaped prompt $0.016, Test it
and its judges $0.169.

**$25 pays for 36 worst-case checks.** The site cap is 30 a day, which is
**$20.67** at worst; it was lowered from 40 when a day could have cost $30.33.
It has not been raised again: the headroom is worth more than the extra ten
checks. The per-visitor cap stays at 5, which is $3.45 at worst for one person.
A test (`scripts/lib/models.test.mjs`) recomputes all of this from the caps and
the shipped prices and fails if a day could reach the limit.

**Typical is far below the worst case.** Three live open-ended checks on the
three default models, measured call by call at the shipped prices: $0.0218,
$0.0094 and $0.0189, mean **$0.017** for the writing, the nine candidate calls
and the judge. The follow-ups roughly double that when a person uses them.

Worth watching: a single worst-case day of 30 checks ($20.67 at these prices,
$20.56 at the 2026-10-15 prices, as recomputed by `scripts/lib/models.test.mjs`)
is most of the $23.96 that was left on the key. The cap is right against the $25 limit, but the
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

## 6b. The first production deployment, 2026-10-09

Promoted from commit `61c8641` to `switch-check.vercel.app`, which is public
(Vercel's sign-in wall covers the preview URLs and the bare production
deployment URL, not the domain).

| Check | Result |
| --- | --- |
| A real open-ended check | **Two were run. The first reached no verdict.** All nine cells answered in 5 s, then both judges failed: Gemini failed twice inside about 3 s, Grok took the remaining 41.8 s as the last judge and did not answer, and the route ran out at 55 s. The page is left as the brief asks, with the answers and the checks there unset for the person to set. The second check, on another task, finished in 16 s with all nine answered, judged by Gemini, and reached "test more" with its reason. |
| The first version still stands | `switch-check-v1.vercel.app` serves the old five-step page: it still says "Step", and has none of the new headline, the recorded examples or the reasoning allowance. 19,669 bytes against the new page's 69,729. |
| `/what-changed` | 200, titled "What changed · Switch Check", with both pictures served (81 KB and 96 KB). |
| Credentials on the production build | 9 assets and 650,127 bytes scanned plus the HTML: the exact key, the key shape, `OPENROUTER_API_KEY`, `LIMIT_SALT` and any 64-character hex string each appear 0 times. `/api/status` returns nothing secret-shaped. |

What the failed check means: a stall in one judge is survivable, a stall in
both is not, and there is nothing after them. The judging step gets the time
the two steps before it left, each judge takes its own share, and when the last
one goes quiet the run simply ends without a verdict. Seen twice now, both
times Gemini: 2.7 to 12.2 s on the same prompt replayed, once 46 s, and now a
pair of fast failures. Worth considering: a third judge, or a shorter share so
a stalled judge is abandoned sooner, or marking nothing and saying plainly that
the judge was unreachable.

## 6c. Ten open-ended checks after the judge change, 2026-10-09

Run locally against the real API on the three default models, so none of it
came off the live site's day. Ten different open-ended tasks.

| Outcome | Count |
| --- | --- |
| switch | 7 |
| stay | 0 |
| test more | 3 |
| no verdict | 0 |

All 90 cells answered. The first judge answered all ten times, so the second
and third were never needed. 14.3 s fastest, 22.2 s slowest, 17.1 s mean. The
ten together cost $0.19.

**Why three of ten said "test more", which is more than the two we would
accept.** Nothing failed: every cell was answered and every answer marked. The
three reasons are all the same shape, that one flipped mark would change the
answer:

1. "if Claude Sonnet 5.5 had passed one more check, the answer would be Claude Sonnet 5.5 instead of GPT-6 Luna"
2. "if GPT-6 Luna had failed one more check, the answer would be Claude Haiku 5.5 instead of GPT-6 Luna"
3. the same as 2, on another task

Two things make that common, and neither is a fault in the judging:

- **Two of the three default models are priced identically.** GPT-6 Luna and
  Claude Haiku 5.5 are both $0.10 in and $0.50 out. Cost is the tie-break the
  verdict leans on, so between those two it cannot separate anything: the
  whole margin rests on the judged checks, and one mark either way swaps the
  winner. Both of reasons 2 and 3 are exactly that pair.
- **There are only twelve marks per model** (three test cases by four checks),
  and capable models pass nearly all of them on a short task. A gap of zero or
  one mark is the normal case, not the unusual one.

So the rule is doing what the brief asks of it on a field that is too evenly
matched to separate. No rule was changed. If fewer "test more" verdicts are
wanted, the levers are more test cases or harder checks, or default models
with prices that differ, not a softer rule.

## 6d. Data handling, 2026-10-15

**What every call asks for.** Each model call, whether candidate, writer or
judge, is sent with `provider: { zdr: true, max_price: { prompt, completion } }`
(`buildRequest` in `lib/server/openrouter.ts`). `zdr: true` restricts routing to
endpoints OpenRouter lists as zero data retention. Without it, OpenRouter's
default (`data_collection: "allow"`) lets a request reach providers that store
it and may train on it. `max_price` is the model's listed price from
`config/model-prices.json`, in the unit OpenRouter's `max_price` takes: USD per
million tokens (openrouter.ai/docs/features/provider-routing, "Max Price",
read 2026-10-15). Several ZDR endpoints cost 10% more than the listed price
(regional Claude, Azure, Bedrock), and without the cap they would make every
cost figure on the page low by up to 10%. A model with no listed price is never
called at all.

**When no endpoint qualifies.** OpenRouter answers 404. Read live on
2026-10-15 with a cap no endpoint could meet, which cost nothing: `404 "No
endpoints found that satisfy the max price for this request"`. The model is
then **not tested**, with the reason "No zero-data-retention endpoint was
available for [model] at its listed price.", through the same path as any
failed call. It is never counted as worse, and there is no fallback to an
endpoint that may keep the task.

**Checked before every price update.** `npm run check-models` also reads
`GET https://openrouter.ai/api/v1/endpoints/zdr` and fails if any configured
model has no ZDR endpoint at or under its listed price. Endpoints with a service
tier (flex, priority) are not counted, because OpenRouter only routes to them
when a request opts into that tier and these never do. The qualifying
endpoints for each model are written next to its price in
`config/model-prices.json` (`zdr_at_price`) and in `docs/models-checked.md`.

On 2026-10-15 all nine models had one. One consequence to watch: OpenRouter's
listed price for DeepSeek V4.1 Flash fell that day from $0.30 / $1.20 to
$0.024 / $0.72, and at that cap a single ZDR endpoint qualifies,
`open-inference/fp4`, a 4-bit quantized one, where the old price had over
twenty. Kept on purpose: the cap is the price the cost figure uses. The cost is
that DeepSeek has no failover and runs quantized. It is not a default model.

**The OpenRouter account's privacy settings.** These were read in the signed-in
OpenRouter dashboard on 2026-10-15 and were not changed:

| Setting | Where | State on 2026-10-15 |
| --- | --- | --- |
| Input & Output Logging (shows prompts and completions in logs) | Workspace > Observability | **Off** |
| Broadcast to external observability platforms | Workspace > Observability | **Off**, no destinations |
| Zero Data Retention, account-wide (all models, Anthropic, OpenAI, Google, SpaceXAI) | Account > Privacy | All **off**, so per-request `zdr: true` is what enforces it |
| Allow paid endpoints that train on request data | Account > Privacy | **Off** |
| Allow free endpoints that train on request data | Account > Privacy | **On** (no Switch Check model is free, so it does not touch this app) |
| Allow free endpoints that publish prompts | Account > Privacy | **Off** |
| Allow 1% data discount in workspaces | Account > Privacy | **Off** |

So OpenRouter keeps no prompt text for this account. The same page says, for
Google's account-level ZDR toggle, "Vertex endpoints require Safety Retention".
For that reason the notice on the page says the task goes "only to endpoints
OpenRouter lists as zero data retention", which is what the app controls, and
does not say that they keep nothing.

**What the app keeps itself.** A finished check is cached for 24 hours under a
key made from the visitor's keyed hash, the task and the models
(`cacheKey` in `lib/server/guard.ts`, version `v2`), so only the visitor who ran
it is shown it again. Before 2026-10-15 the key held only the task and the
models, so a second visitor who typed the same task was shown the first
visitor's run; the `v1` entries are never read again and expire within the day.
The key holds neither the task nor the address. Tickets for follow-ups are kept
60 minutes. Error logs carry the error's name only. The hosting platform keeps
its own request logs, which the app does not control.

**Where the calls went, checked.** The first live check after this change
(local, 2026-10-15 10:19) was read in OpenRouter's activity page. Every call
went to a zero-data-retention provider: Google for both Claude models and both
Gemini models, Azure for GPT-6 Luna.

## 6e. Speed under zero-data-retention routing, 2026-10-15

**Why it was measured.** In three live checks after the change above, GPT-6
Luna ran out of time on one case in two of them, at 35 s and 32 s. In both of
those, the first judge did not answer either, and the check took about 49 s.
On 2026-10-09, before the change, ten checks answered all 90 of 90 cells.

**The judge part is fixed in the code.** When the answers run long, judging
starts with only its 15 s share. Split evenly across three judges, the first
judge (Gemini 2.5 Flash, 8.9 s at the median) got 5 s and could not answer.
`attemptDeadline` (`lib/server/judge.ts`) now holds back only the 5 s the next
judge needs, and only when that leaves the current attempt 5 s too. With 15 s
left: 10 s, then the remaining 5 s, then no third turn. With more time,
every attempt is still capped at 12 s.

**The measurement.** 10 calls per model, one after another, with the app's
real request shape: `zdr: true`, the listed price as the cap, the classify
example's prompt and test cases, 600 answer tokens plus 1,024 for reasoning,
and a 45 s limit per call. Times are wall-clock from this machine, including
the network.

| Model | Endpoint | Times (s), in order | Over 15 s |
| --- | --- | --- | --- |
| GPT-6 Luna | Azure, every call | 4.4, 3.2, 2.0, **45.0 (no answer)**, 2.0, **45.0 (no answer)**, 1.7, 9.6, **26.3**, 2.6 | **3 of 10** (2 never answered) |
| Claude Haiku 5.5 (control) | Google, every call | 0.8, 0.8, 1.1, 0.8, 0.7, 0.9, 0.8, 0.9, 1.0, 0.7 | 0 of 10 |

Luna was billed at its listed price ($0.10 / $0.50), so the answers came from
the plain Azure endpoint, not a regional one. Luna's tail is slow on its own,
with no judge and no other call involved. Under ZDR it has a single provider,
so a slow call has nowhere else to go.

**DeepSeek V4.1 Flash without 4-bit endpoints.** Sent with
`quantizations: ["int8", "fp6", "fp8", "mxfp8", "fp16", "bf16", "fp32"]`,
the values in OpenRouter's provider-routing doc that are not 4-bit. `unknown`
is left out, because unknown precision cannot show that full precision is
reachable.

- At today's listed price as the cap ($0.024 / $0.72): no endpoint qualifies.
  1 call, `404 "No endpoints found for the request with quantization: ..."`,
  nothing billed. Every non-4-bit ZDR endpoint costs more than that.
- At the 2026-10-09 listed price as the cap ($0.30 / $1.20): 10 of 10
  answered, spread across three providers. Times 0.9, 0.6, 0.9, 1.1, 1.0, 1.0,
  0.6, 0.8, 0.8, 0.7 s; 0 of 10 over 15 s.

| Provider | Calls | Price billed (in / out per 1M) | Quantization |
| --- | --- | --- | --- |
| CoreWeave | 4 | $0.15 / $0.65 | fp8 |
| Morph | 3 | $0.033 / $0.60 | fp8 |
| DeepInfra | 3 | $0.14 / $0.42 | fp8 |

The price billed is OpenRouter's own cost for each call divided by its tokens,
and it matches the ZDR list exactly. The quantization is read from that list
for the provider at that price. The reply does not name it. So a non-4-bit
DeepSeek is reachable under ZDR, and fast, but only with a cap above today's
listed price, at up to $0.15 / $0.65.

All of the above together cost under $0.01.

## 6f. The three judges under zero-data-retention routing, 2026-10-15

**Why it was measured.** On the live production check of 2026-10-15 the first
judge (Gemini 2.5 Flash) did not answer inside its share, although only the two
default models were on the grid and GPT-6 Luna was not involved. Section 6e read
the first-judge failures as following Luna's timeouts. This run had no Luna, so
the reading needed numbers of its own. The judge order is not changed here.

**The measurement.** The method of section 2a with the request shape of 6e. The
judge prompt is the one the app sends: `shuffleBlind` and `buildJudgePrompt`
(`lib/judging.ts`) on the recorded "Sort support tickets" example (its prompt,
its 4 checks and its 9 answers, 36 marks per call), a new shuffle for every
call, and every reply read with `parseJudgement`. Each call went through the
app's own `complete` and `buildRequest` (`lib/server/openrouter.ts`): `zdr: true`,
the listed price as the cap, 4,000 answer tokens, a 45 s limit. 10 calls per
judge, one after another, from this machine, so the times include the local
network. The script was a one-off and is not kept in the repository. The
provider is the one OpenRouter names in each response; it names the company, not
the endpoint, so the endpoint is the one the ZDR list gives for that provider
(Vertex for Google) and was not read from the activity page.

| Judge | Endpoint | Times (s), in order | Over 12 s | Answered | Parsed | Unset |
| --- | --- | --- | --- | --- | --- | --- |
| Gemini 2.5 Flash | Google, every call | 7.0, 8.3, 10.1, 7.7, 7.0, 6.6, 6.9, 5.5, 9.3, 6.9 | 0 of 10 | 10 of 10 | 10 of 10 | 0 of 360 |
| Gemini 3.8 Flash | Google, every call | 2.4, 2.4, 2.4, 3.0, 2.7, 2.6, 2.5, 3.4, 2.9, 2.2 | 0 of 10 | 10 of 10 | 10 of 10 | 0 of 360 |
| Mistral Medium 3.1 | Mistral, every call | 2.4, 2.4, 2.1, 2.1, 2.2, 2.1, 2.2, 2.2, 2.4, 2.1 | 0 of 10 | 10 of 10 | 10 of 10 | 0 of 360 |

Medians: 7.0 s, 2.6 s and 2.2 s. Worst calls: 10.1 s, 3.4 s and 2.4 s. No reply
was cut off at the token limit.

**Cost.** OpenRouter's own cost for the 30 calls adds up to $0.066 ($0.037,
$0.017 and $0.012 per judge). They did not go through the page, so they did not
touch the site's daily counter.

**What the numbers show.** Under zero-data-retention routing, with no Luna on
the grid and no other call running, the first judge answered and parsed 10 of 10
calls, none over 12 s and the slowest at 10.1 s, which is slower than the other
two seats (7.0 s at the median against about 2.5 s) and inside the 12 s attempt
cap every time. So these ten calls do not reproduce the production failure, and show no slow
tail of the judge that would explain it. What differed on production and was
not measured here is the time the judge was left with after the writer and the
answers had run, and the task and the answers themselves. The first judge's
worst case stayed under the 12 s attempt cap in all 10 calls, so the
more-than-1-in-10 condition for flagging it is not met. The order of the judges
is decided in a separate step.

## 7. Not decided yet

- Whether to raise the limits once real use is seen.
- Whether a command-line or agent entry point should sit on the same route.
