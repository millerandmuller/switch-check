# Switch Check: user journey

A sketch of the four steps from opening the page to a result you can act on. It follows the example workflow in `SPEC.md` (client email triage). All numbers, timings and outputs below are made-up sample values for the wireframes, not measurements.

The decision at the end is the person's: switch, stay, or test more. The tool shows evidence and never picks for them.

## The rule for missing data

Cost and speed are never guessed. Every number on screen is in exactly one of three states:

| State | Shown as | When |
| --- | --- | --- |
| Measured | `4.1 s`, `$3.20` | Taken from a live call: the provider's reported token usage and the measured response time |
| Estimated | `~$0.18 (estimated)` plus source and date | Only when a live measurement is missing and there is a fixed, stated method (see below). Always shows where the price came from and when |
| Not measured | `not measured` | Anything else. No number, no placeholder, no average from elsewhere |

The estimate method, so it is never improvised: tokens are counted from the text length at 4 characters per token, multiplied by the per-token price OpenRouter published on the shown date. The label names all three parts: `estimated, price from OpenRouter, checked 2026-09-28, tokens from text length`.

Two consequences apply everywhere below:

- A model that does not answer is marked **not tested**, never "worse", and is left out of the summary counts.
- A comparison line such as "94% cheaper" appears only when both models have a cost (measured or estimated). If either is missing, the summary says "cost not compared".

## Step 1: Enter the prompt, inputs and models

The person pastes the prompt they already use, marks where the real input goes with `{input}`, adds three inputs (up to 4,000 characters each) and picks two models: the one they use today and one to compare.

```text
+--------------------------------------------------------------------------+
| Switch Check                                                             |
+--------------------------------------------------------------------------+
| Your prompt (use {input} where the real input goes)                      |
| +----------------------------------------------------------------------+ |
| | You triage client emails. Read the email below and return:           | |
| | 1. priority (urgent / normal / low)                                  | |
| | 2. category (billing, scheduling, question, spam)                    | |
| | 3. a short reply draft                                               | |
| |                                                                      | |
| | Email: {input}                                                       | |
| +----------------------------------------------------------------------+ |
|                                                                          |
| Inputs (3)                                        [Use sample workflow]  |
| +--------------------------+ +--------------------------+ +-----------+  |
| | 1  SAMPLE                | | 2  SAMPLE                | | 3  SAMPLE |  |
| | Client disputes an       | | Client asks to move      | | Newsletter|  |
| | overdue invoice...       | | tomorrow's meeting...    | | in inbox..|  |
| |               412 / 4000 | |               168 / 4000 | |  903 /4000|  |
| +--------------------------+ +--------------------------+ +-----------+  |
|                                                                          |
| Model you use today        Model to compare with                         |
| [ Claude Sonnet 5.5   v ]  [ GPT-6 Luna                v ]               |
|                                                                          |
| Nothing is saved unless you choose to share the result.                  |
|                                                        [ Run both ]      |
+--------------------------------------------------------------------------+
```

What the page checks before it lets the person run:

- The prompt contains `{input}` once or more, and all three inputs are filled and within 4,000 characters. Otherwise the field shows what is wrong and Run stays disabled.
- The two models are different.
- Sample inputs are labeled `SAMPLE` on screen so they are never mistaken for real client mail.

Missing data in this step: each model's price is read from OpenRouter's published list. If a chosen model has no published price, the picker shows `price not available` next to it. The run is still allowed, and its cost will show `not measured` in step 3.

## Step 2: Run both models, or paste outputs by hand

The default is a live run: both models get the same prompt and the same three inputs. If live calls fail, the person can paste outputs by hand and continue.

### 2a. Live run

```text
+--------------------------------------------------------------------------+
| Running 3 inputs on 2 models                                             |
|                                                                          |
|                       Input 1      Input 2      Input 3                  |
| Claude Sonnet 5.5     done 4.1 s   done 3.6 s   running...               |
| GPT-6 Luna            done 1.9 s   waiting...   waiting...               |
|                                                                          |
| Spend cap for this run: $0.25                                            |
+--------------------------------------------------------------------------+
```

- Per-call results stream in as they finish. Time is measured per call, from request sent to the full answer received.
- A call that errors or times out is marked `not tested` in its cell. The rest of the run continues.
- The run stops before it would pass the $0.25 spend cap, and says so.

### 2b. Paste by hand (when live calls fail)

Shown when OpenRouter is down, the key is missing, or every call for a model failed. The person can also choose it at any time.

```text
+--------------------------------------------------------------------------+
| Live calls didn't work: OpenRouter did not answer.                       |
| You can paste each model's output yourself and still review the result.  |
|                                                                          |
| Input 1 (sample: overdue invoice)                                        |
|  Claude Sonnet 5.5 output   +--------------------------------------+     |
|                             | priority: urgent ...                  |    |
|                             +--------------------------------------+     |
|  GPT-6 Luna output          +--------------------------------------+     |
|                             | (paste here)                          |    |
|                             +--------------------------------------+     |
| ... inputs 2 and 3 the same way ...                                      |
|                                                   [ Continue to compare ]|
+--------------------------------------------------------------------------+
```

Missing data in this step:

| Situation | What the screen shows |
| --- | --- |
| Live call has no usage numbers from the provider | Cost switches to the estimate method above and is labeled `estimated` with source and date |
| Live call timed out or errored | Cell says `not tested`; speed and cost for that cell say `not measured` |
| Output pasted by hand | Speed is `not measured` (nobody timed it). Cost is `estimated` with source and date, because tokens come from text length. The pasted output is tagged `pasted` so it is never confused with a live one |
| Prompt text was not run by the tool | The tool cannot know the input tokens exactly; cost stays `estimated` |
| Model has no published price | Cost is `not measured`, no number |

## Step 3: Side-by-side comparison per input

For each input, the two outputs sit next to each other, with speed under each output and one cost block for the whole run.

```text
+--------------------------------------------------------------------------+
| Input 1 of 3  SAMPLE: client disputes an overdue invoice                 |
+-------------------------------------+------------------------------------+
| Claude Sonnet 5.5 (today)           | GPT-6 Luna (compare)               |
|                                     |                                    |
| priority: urgent                    | priority: urgent                   |
| category: billing                   | category: billing                  |
| reply: Thanks for flagging this.    | reply: Sorry about the confusion.  |
| I'm checking invoice 1042 and will  | I've issued a credit note for      |
| reply by end of day.                | invoice 1042.                      |
|                                     |                                    |
| Speed: 4.1 s (measured)             | Speed: 1.9 s (measured)            |
+-------------------------------------+------------------------------------+
| [Input 1]  [Input 2]  [Input 3]                                          |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
| Cost per 1,000 runs                                                      |
|                                                                          |
| Claude Sonnet 5.5   $3.20         GPT-6 Luna   $0.18                     |
| measured tokens:                  measured tokens:                       |
|   avg 450 in / 230 out              avg 470 in / 260 out                 |
| price: OpenRouter, 2026-09-28     price: OpenRouter, 2026-09-28          |
|                                                                          |
| Average speed: 3.9 s              Average speed: 2.0 s                   |
+--------------------------------------------------------------------------+
```

How the numbers are made:

- **Cost per 1,000 runs** = (average input tokens x input price + average output tokens x output price) x 1,000. Averages are over the inputs that model actually answered. Prices are OpenRouter's published per-token prices, and the price source and date appear next to the number.
- **Speed** is the measured response time for each call, shown per input and averaged.

Missing data in this step:

| Situation | What the screen shows |
| --- | --- |
| One model has no answer for an input | That cell reads `not tested`. The other model's output still shows |
| Speed missing (pasted output, or timing lost) | `Speed: not measured` in that cell. The average is computed only from measured cells and says how many: `Average speed: 4.0 s (2 of 3 measured)`. With none measured: `not measured` |
| Token usage missing | Cost shows `~$0.18 (estimated: price from OpenRouter, checked 2026-09-28, tokens from text length)` |
| No published price | `Cost: not measured`. No dollar figure, and no cost comparison in step 4 |
| Price date is older than the run | The date is shown as is. The tool does not silently refresh or round it |

## Step 4: Review the result

The person marks each input: better, same or worse for the compared model against the one they use today. The tool never picks a mark. (A later version may suggest one with a one-line reason the person can change.)

```text
+--------------------------------------------------------------------------+
| Your verdict per input        (compared model vs. the one you use today) |
|                                                                          |
| 1  Overdue invoice     ( ) better  ( ) same  (x) worse                   |
|    Why: reply promises a credit note nobody asked for                    |
| 2  Move meeting        ( ) better  (x) same  ( ) worse                   |
| 3  Newsletter          ( ) better  (x) same  ( ) worse                   |
|                                                                          |
| For this workflow, worse means: a wrong priority, a missing field, or    |
| a reply draft that promises something the email didn't ask for.          |
+--------------------------------------------------------------------------+
| Summary                                                                  |
|                                                                          |
|   Same result on 2 of 3, worse on 1, 94% cheaper.                        |
|                                                                          |
|   Cost: $3.20 vs $0.18 per 1,000 runs (OpenRouter prices, 2026-09-28)    |
|   Speed: 3.9 s vs 2.0 s average                                          |
|                                                                          |
| Your call: [ Switch ]  [ Stay ]  [ Test more ]     [ Share this result ] |
+--------------------------------------------------------------------------+
```

How the summary line is built, only from the person's marks and the shown numbers:

- The counts come from the marks: `Same result on N of M`, `better on N`, `worse on N`. Parts with a count of zero are left out.
- `M` counts only inputs where both models answered. Inputs marked `not tested` are listed separately: `1 input not tested`.
- The cost clause (`X% cheaper` or `X% more expensive`) is computed from the two cost-per-1,000 figures on screen, and only when both exist. If one is estimated, the clause says `about` and the summary shows `(estimated)`.
- The tool does not turn the marks into a recommendation. The three buttons are the person's choice, and nothing changes in any live workflow.

Missing data in this step:

| Situation | Summary line |
| --- | --- |
| Everything measured | `Same result on 2 of 3, worse on 1, 94% cheaper.` |
| Cost estimated | `Same result on 3 of 3, about 94% cheaper (estimated).` |
| Cost missing for either model | `Same result on 3 of 3. Cost not compared: price not available.` |
| Speed not measured | The speed line reads `Speed: not measured`. The summary text is unaffected |
| A model failed on one input | `Same result on 2 of 2, 1 input not tested, 94% cheaper.` |
| A model failed on every input | No summary. The page says `Not tested: <model> did not answer.` and offers Test more |
| Person has not marked every input | No summary yet. The page says how many inputs still need a mark |

Sharing is optional. Only when the person presses Share does anything get saved, and the shared page shows the same labels (`measured`, `estimated` with source and date, `not measured`, `not tested`, `pasted`) as the person saw.
