# Changelog

What changed in Switch Check, newest first. Days are the days of the Early
AI-Dopters 30-Day Community Hackathon.

## Week 3, so far (Oct 9, 2026, Day 15)

The first tester stopped at the fourth step, where the page asked for six
outputs pasted in from other tools. The app now runs the models itself, and
the five steps are one page.

### Decided

- **One build for every feature, not one feature a day.** The whole rebuild
  went in as a single round, so the response to the review is itself fast.
  The daily changes after it are smaller.
- **The tool now says what to do.** The old rule that it never suggests a
  decision is dropped. The verdict is still only as strong as the evidence
  line under it says, and every result is a control the person can flip.
- **A verdict that one judged result could change is "test more".** With a
  tolerance of one check, a model exactly one behind the best, or a cheaper
  model exactly two behind, is one flipped result from the other answer. So
  "switch" and "stay" appear when the cheap model ties or beats the best, or
  is clearly behind. This follows from the rule as written and is pinned by
  tests (`scripts/lib/verdict.test.mjs`).
- **Gemini 3.8 Flash writes the test and judges.** It judged the same answers
  in 3 to 5 seconds against 12 to 16 for Grok 4.7, and agreed with Grok 4.6 on
  the one set both marked. The cost is that one model writes the checks and
  marks the answers, so the evidence line says so. Grok 4.7 is the second
  choice if the first judge fails. The page names whichever judge ran.
- **Reasoning is set to low for every model.** Some models cannot switch it
  off (Sonnet, Opus, Gemini, Grok refused it). A model that spends all 600
  tokens reasoning is shown as not tested, with that reason.
- **Two smaller candidates added:** Claude Haiku 5.5 and DeepSeek V4.1 Flash,
  both with dated prices (2026-10-09). Writer and judges have dated prices too.
- **Writing the prompt and the test cases is one call, so one stage line.**
  The brief listed two; with one call they would share a timer.
- **Provider names in coloured marks, not logos.** The what-changed page
  paraphrases the first tester and does not name them.

### Added

- **A server route that runs the whole check** and streams it: writing, the
  grid with a timer in every cell, judging, the verdict. Starts from the old
  sample runner. Failed calls are "not tested" with the reason.
- **The prompt writer** (prompt, three test cases, three to five checks, task
  class, and for a project the slice tested and the slice not tested).
- **The blind judge** (shuffled letters, no names, quotes checked against the
  answer) and **the verdict rule** with its sentence, each with tests.
- **Your words against the written prompt**, **a prompt shaped for the
  recommended model with Test it**, **flip any check**, **edit a test case and
  run again** (with a note when the verdict changes).
- **Three recorded examples**, run once with the real code, labelled as
  recorded, used when the limit is reached or the provider is down.
- **Spending limits:** 5 checks per visitor and 40 per site per day, the caps
  as constants with tests, a 24-hour cache, fail closed when the store is
  unreachable. `/what-changed` and a new README.
- Fenced code in answers now shows as code in the formatter.

### Fixed

- **Hidden reasoning no longer eats the answer.** A reasoning model used to
  get one 600-token cap for its thinking and its answer together, so on some
  open-ended wording it spent the lot on thinking and the cell read "not
  tested", which made the verdict "test more". Reasoning now has its own
  1,024-token allowance on top of the answer's 600, asked for as a hard
  budget and not as an effort: measured against the API, `effort: "low"` let
  DeepSeek V4.1 Flash spend 600 of 600 and then 1,624 of 1,624 tokens on
  thinking and return nothing, while a 1,024-token budget had it stop at 873
  and answer. The reasoning tokens are billed as output and stay inside the
  cost figure, and the page says the allowance is there. A model that still
  writes no answer gets a cell that says where its tokens went.
- **Each step of a run is promised its own slice of the minute.** Writing the
  test took 4 to 11 seconds live and shared one run-wide deadline with the
  model calls, so a slow writer could leave them a few seconds and turn every
  cell into "not tested". The writing step now gets 25 seconds, the model
  calls 18 and the judge 12 — adding up to the route's whole allowance, with
  each step also getting what the steps before it left unused.

### Changed

- **One page replaces the five steps.** Removed: the step flow, the paste
  step, the protection for pasted work, the sample-results tag system, the
  rating screens. Kept: the look, `FigureChip` (now takes a figure with its
  state, so a number cannot be drawn without one), the formatter, dated
  prices, the "not tested is never worse" rule.
- **Response times are measured after the whole answer is read.** The first
  version of the new runner stopped the clock when headers arrived, which
  under-counted by a factor of two to three. Found by comparing with wall time.
- A cached run is shown with the visitor's own "model you use today", and the
  verdict is worked out again for it.

### Missed

- No second pass of tuning yet. The writer and judge were tuned against a handful of
  live runs; the checks are sometimes easy, and a ceiling of 12 of 12
  for every model is common on simple tasks.
- Not yet tried by anyone outside. Getting five community members to run a
  check on a task of their own is the first job of the next days.
- The narrow-screen layout was reasoned from the CSS (the grid scrolls
  sideways), not looked at on a phone.

## Week 2 (Oct 2 to Oct 8, 2026)

The week went into making one comparison complete on screen: real outputs for
the sample, a rating for each output, and a first test of the whole flow with
the fixes that came out of it. The app still does not call a model itself.

### Decided

- **How the app will reach the models (Day 14).** Both models are called
  through OpenRouter, from the server, with one key that never reaches the
  browser. Pasting outputs by hand stays as the fallback. The reasons, the
  limits on a run, the prices with the date they were checked, what happens
  when a model is missing and the check for exposed keys are in
  [`docs/model-connection.md`](docs/model-connection.md). Nothing is
  implemented yet.

### Changed

- **The result screen in the glass look (Oct 8).** The summary line has two
  weights, each model's cost and response times are chips with their state
  word beneath the figure (estimated, per 1,000 runs; measured, one run, 3 of
  3 inputs; or not measured with its reason), and the sentences with the
  price source and dates sit in a closed "How these figures were worked out".
  The three inputs are cards with their row result, ratings and notes, and the
  three decision choices are pills, none preselected. No wording or rule
  changed. In the same commit: the blur behind the panel and cards was not
  applied in Chrome (the minifier kept only the prefixed property); it now is,
  and without `backdrop-filter` they stay solid ivory. Where a model has
  nothing measured, its header says so once in one chip, not twice.

- **Outputs read as formatted text, with the raw text one click away (Oct 8).**
  Marks such as `**Priority:**`, numbered lines, `- ` bullets and `> `
  quotes now show as bold text, numbered and bulleted items and quotes (issue
  20 of the manual flow test). Each output card has a Show raw / Show
  formatted link; raw shows the stored characters exactly, in the mono face.
  The tag keeps to what is true: "formatted for reading" in the formatted
  view, "shown exactly as returned" (or "as pasted") only in the raw view.
  Formatting is display only: ratings, the removal rule, the check that a cell
  still holds what the run returned and the cost figures all work on the
  stored text. A new pure file, `lib/output-format.ts`, builds blocks that the
  page turns into elements, never into HTML, and 12 new tests cover the six
  saved outputs, unbalanced `**`, lines that only look like lists, empty
  outputs and text with `<` and `&`.

- **The rating screen says less at first glance (Oct 8).** The three inputs
  are pill tabs with a status dot and its word (not rated yet, better, same
  rating, worse, not tested), so colour is never the only signal. Cost and
  time are two rounded chips per model, the figure large with its state and
  unit beneath it (estimated, per 1,000 runs; measured, this input), or "not
  measured" with its reason. The shared source line moved into a closed
  "How these figures were worked out" disclosure at the bottom, with
  everything it said before plus that the cost is an estimate, not a bill.
  The summary line has two weights, and each card heading shows the role and
  the model id only. The line under the summary now says "The line below
  counts your ratings", because it moved above the summary. The three
  columns are kept. Reading area of one output at 100% zoom, before and after
  rating: 484 and 500 px at 1440 x 900, 320 px at 1280 x 720.

- **The Start screen is redrawn around the two choices (Oct 8).** The headline
  has two weights ("Should you switch models?" in semibold, "See for
  yourself." light), followed by the lead, the notice that nothing is saved,
  and the two choices as cards on one panel with a hover lift and a named
  arrow line. "Switch Check" stands very large and light behind them along
  the bottom, hidden from screen readers and not selectable. The wording of
  the lead and both choices is unchanged. At 390 px the choices stack.

- **A layered glass look on every screen (Oct 8).** The page now has three
  layers: a gold, sage and deep green ground drawn with CSS gradients, one
  frosted panel per screen, and warm ivory cards for everything you read or
  type into. Text is deep pine green with one pine accent, headlines and
  figures are set in Outfit, reading text in Figtree, ids and the prompt in
  JetBrains Mono. Labels are sentence case, buttons, tabs and ratings are
  pills, fields are soft and filled. Focus is a 2 px pine ring with a light
  halo, cards and panel fall back to solid ivory without `backdrop-filter`,
  and the hover lift is off under reduced motion. No behaviour or layout
  changed.

- **Both outputs are hard to miss at phone width (Oct 8).** Below 1,000 px the
  switch between the two models sits in the rating bar, next to the rating,
  and shows for each model its rating or "not rated". If you press Next input
  while the other model is unrated, the page shows that model and says so;
  pressing Next input again moves on. Next input goes to the top of the next
  input, and the input text is closed behind "Show the input", so the output
  comes first.

- **Focus, contrast and small points of clarity (Oct 8).** After Next input,
  keyboard focus moves to the heading of the first output, and the focus ring
  is 2 px in ink everywhere. Small gold labels are a darker gold (5.36:1 on
  white, 4.80:1 on the cream panels; the old one was 3.4:1), the lighter gold
  stays on large numerals, and no label is under 12 px. The two choices on
  Start have a heavy edge, an arrow and a hover state. Error messages and the
  edge of the field they belong to are red-brown instead of black. Steps 2, 3
  and 4 have a Back button that names where it goes. Step 2 says that the four
  models listed are the ones Switch Check has prices for today. Back to rating
  returns to the input you left.

- **The page says what will be removed before it removes it (Oct 8).** On
  steps 2 and 3, as soon as the prompt, an input or a model differs from the
  one your outputs were made with, a notice above the main button says how
  many outputs, and how many ratings on them, continuing will remove. The
  button then reads "Continue and remove 2 outputs", and "Undo my change"
  puts the changed fields back with nothing removed. The "Use sample
  workflow" question names the outputs and ratings it leads to removing. The
  rule itself, and the notice on the next screen, are unchanged.

- **Labels and notes now match the state (Oct 8).** An input whose rating of
  either model is missing reads "Not rated yet", and an untested one "Not
  tested", without naming the compared model. With nothing measured, the
  result screen no longer says the times are from a single run; each model
  says "cost and response time not measured" once and one line gives the
  reason. "See the result" with ratings missing now lists the inputs that
  still need one, each with a button back to it, and the three decision
  choices appear only when every output that was tested has a rating. In the
  step bar, steps that came with the example read "from the example" instead
  of "done" until you press their button yourself. The start screen no longer
  says "four short steps" next to "Step 1 of 5", and the result screen has its
  own label.

- **The outputs get most of the rating screen (Oct 8).** At 1,000 px and
  above the rating screen is three columns: the selected input, the output of
  the model you use today, the output of the model to compare with. The three
  inputs are tabs across the top. Each output scrolls in its own reading area,
  at least 320 px high; when the window is too short for that, the page
  scrolls instead. One source line above the columns gives the price source
  and date, the run date, the number of inputs and each model's range of
  response times for both models, and the small cost line under each model is
  gone. "What the ratings mean" is a disclosure that closes after your first
  rating. "Show the prompt" is closed in the input column. The summary line is
  a size smaller, with room for two lines, so rating no longer moves the
  panels. Where nothing was measured, each header says so once and the source
  line gives the reason once.

- **Its own look (Oct 8).** One light look with square, hairline-edged blocks,
  four typefaces (Newsreader, Lato, Poppins, JetBrains Mono) and the full
  width of the window. The dark variant is gone. Nothing behaves differently.
- **A guided flow in five steps (Oct 8).** The three screens are now five
  steps with a bar across the top: Start, Prompt and models, Inputs, Outputs,
  Rate and result. Each step has one job and one main button that names where
  it goes. A finished step in the bar goes back to it, and a step that cannot
  be opened yet is shown and cannot be pressed. Start offers the finished
  example, with nothing rated, or a comparison on your own prompt. The Ready
  screen is gone. After each step change, keyboard focus is on the new
  heading.
- **The page asks before it replaces your work (Oct 8).** Use sample workflow
  over a typed draft, Load sample results over pasted outputs, and opening the
  example over a comparison in progress each ask first, in the page, with two
  buttons that name both outcomes. When editing an output removes its rating
  and note, a line next to that output now says so. When the saved sample
  results are not offered, a line says which draft they belong to.
- **The line about saving says what is true (Oct 8).** "Nothing is saved unless
  you choose to share the result" is replaced by "Nothing is saved. Reloading
  this page empties it." There is no way to share or save.
- **Copy-ready prompts in the outputs step (Oct 8).** Getting the outputs is
  now six tasks in a fixed order, one per input and model. Each task has a
  **Copy the filled-in prompt** button that copies your prompt with that input
  already in place of every `{input}`, the same text to read on the page, and
  the box to paste the answer into. A line counts how many of the six are
  pasted. If the browser does not allow copying, the text is shown selected to
  copy by hand. You still run each prompt in your own tool: the page runs
  nothing.
- **Rating one input at a time (Oct 8).** At 1,000 px wide and above, the
  three inputs sit in a left rail with the selected input's full text, and the
  two models' outputs stand side by side. Each output scrolls on its own, and
  its rating and note stay in sight under it, so the window does not scroll.
  Each model's header shows its cost and this output's response time, marked
  estimated, measured or not measured, with the price date and the run date.
  The summary line and the three rating descriptions run across the top.
  **Next input** moves on, and the keys 1, 2 and 3 switch the input. Below
  1,000 px it is one column with a switch between the two models' outputs.
  The comparison table is gone.
- **A result screen where you record your decision (Oct 8).** After the third
  input, **See the result** opens a last screen: the summary line, each
  model's cost and speed with their states and dates, each input's result
  with your ratings and notes, and three choices: Switch, Stay, Test more.
  None is preselected and the tool does not suggest one. The choice is shown
  on the screen and nothing else happens: it is not saved or sent. **Start a
  new comparison** asks first, because it empties the page.

### Added

- **Cost and speed (Day 14, the Day 10 step).** With the sample results
  loaded, each model shows an estimated cost per 1,000 runs and the response
  times of the saved run. The cost is worked out from OpenRouter's published
  price and the tokens the run used, and carries the price date and the run
  date. The times are from one run. Outputs pasted by hand read `not measured`,
  because Switch Check did not run them.
- **Real sample results (Day 9, the Day 8 step).** `npm run sample-results`
  runs the sample workflow once on the default model pair through OpenRouter
  and saves the six outputs, with their token counts and response times, to
  `demo-data/sample-results-<date>.json`. In the comparison view, **Load
  sample results** fills the table with those outputs, tagged `sample run`
  with the run date. The button is offered only for the unchanged sample
  workflow on the default pair. The outputs are saved exactly as the models
  returned them.
- **Quality review (Day 9).** In the shown comparison, each output can be rated
  on a three-point scale (Usable as is, Needs edits, Not usable) with an
  optional one-line note of up to 200 characters. The rating and note sit in
  the cell of the output they judge, and the three points are described above
  the table. Each row shows whether the compared model was rated better, the
  same or worse than the model in use today, and a line above the table counts
  those rows. Both are worked out from the person's own ratings: the tool does
  not rate anything itself. A rating and its note are cleared when that
  output's text changes.

### Fixed

- **Outputs no longer stay under a prompt, input or model that did not
  produce them (Day 13).** When the prompt, an input or a model is changed and
  Continue is pressed, the outputs that belonged to the old one are removed
  from the comparison together with their ratings and notes, and a notice says
  how many. A change that is undone before Continue removes nothing. These
  were issues 1 and 2 of the manual flow test.
- **The header says what the tool does today (Day 13).** It no longer says
  Switch Check runs your prompt. It says you run both models yourself and paste
  what they returned, and that the decision stays yours. This was issue 3.

### Tested

- **Manual flow test (Day 12).** The whole flow was run end to end in a browser
  with the sample workflow, once with the saved sample results and once with
  pasted outputs. Nothing was fixed that day. The 22 issues found, with steps
  for each and the three to fix first, are in
  [`docs/manual-flow-test.md`](docs/manual-flow-test.md).

### Not there yet

- The app does not run models itself. Outputs are pasted by hand, or loaded
  from the one saved run of the sample.
- Cost and speed are shown for the saved sample run only. A person's own
  pasted outputs have neither.
- 10 of the 22 issues from the manual flow test are open.
- There is no live deployment.
- Nobody outside the project has used it yet.

### Missed

- Day 7's work was logged a day late, under Day 8, so Day 8's own step was
  built on Day 9.
- Days 10 and 11 were not built or logged. Day 10's step (speed and cost) was
  built on Day 14. Day 11's step (more test workflows) was not built.

## Week 1 (Sep 27 to Oct 1, 2026)

The week went into deciding what the tool is, then building the first two
screens. Nothing calls a model from the app yet.

### Added

- **Comparison view (Day 7).** A side-by-side table with the three inputs as
  rows and the two models as columns. Outputs are pasted in by hand, and each
  cell shows its full output. Pasted outputs are tagged `pasted`, and a cell
  with nothing in it reads `not tested`.
- **Input form (Day 6).** One prompt, exactly three inputs of up to 4,000
  characters each, and two model pickers. An incomplete set is refused with a
  message next to the field that says what is wrong. A complete set submits
  into a read-only "Ready to compare" panel.
- **Sample workflow (Day 6).** A made-up email triage workflow that fills the
  form in one click. The three emails are invented and are marked as samples in
  the data and on screen.
- **Project skeleton and model price check (Day 4).** A Next.js app, plus a
  script that reads the candidate models' published prices from OpenRouter and
  records the date they were checked.
- **User journey sketch (Day 4).** The four steps from pasting a prompt to a
  switch, stay or test-more decision, including what each screen shows when
  data is missing.
- **Product spec (Day 3).** What Switch Check does, who it is for and what it
  will not do.

### Not there yet

- The app does not run models itself. Outputs are pasted by hand for now.
- No speed or cost figures are shown anywhere.
- There is no live deployment.

### Missed

- Day 5 was not logged. The parts of it that the input form needed were built
  on Day 6.
