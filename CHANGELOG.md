# Changelog

What changed in Switch Check, newest first. Days are the days of the Early
AI-Dopters 30-Day Community Hackathon.

## Week 2 (from Oct 2, 2026)

### Added

- **Quality review (Day 9).** In the shown comparison, each output can be rated
  on a three-point scale (Usable as is, Needs edits, Not usable) with an
  optional one-line note of up to 200 characters. The rating and note sit in
  the cell of the output they judge, and the three points are described above
  the table. Each row shows whether the compared model was rated better, the
  same or worse than the model in use today, and a line above the table counts
  those rows. Both are worked out from the person's own ratings: the tool does
  not rate anything itself. A rating and its note are cleared when that
  output's text changes.

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
