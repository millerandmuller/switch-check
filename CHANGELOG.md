# Changelog

What changed in Switch Check, newest first. Days are the days of the Early
AI-Dopters 30-Day Community Hackathon.

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
- 18 of the 22 issues from the manual flow test are open.
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
