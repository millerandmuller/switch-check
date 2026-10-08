# Manual flow test

- **Date:** Oct 6, 2026 (Day 12)
- **Commit tested:** `f182931` on `main`, run locally with `npm run dev`
- **Browser:** Chrome 154 on macOS, light mode
- **Widths:** desktop, with the page between 1,280 and 1,600 px wide (the
  browser window changed size during the test); phone width in a 386 px wide
  frame, with a check for sideways scrolling at 316, 356 and 410 px

**What was run:** the shipped sample workflow (client email triage) on the
default model pair, `anthropic/claude-sonnet-5.5` and `openai/gpt-6-luna`, once
with the saved sample results loaded and once with six outputs entered into the
paste fields.

**How it was run:** this was an automated browser session, not a person at a
keyboard. An AI coding assistant drove Chrome: it pressed the buttons, filled
the fields, sent real key presses for the notes and the keyboard check, and
read back what the page showed, with screenshots at each screen. It can find
broken states and things the page says that are not true. It cannot be puzzled
the way a first-time member is, so the "confusing" entries below are places
where the page gave no answer to an obvious question, not reports of a person
hesitating. The ratings were picked to produce every row result, they are not
a judgment of the two models.

No model was called. In the second pass, four of the six pasted texts were the
saved outputs from `demo-data/sample-results-2026-10-03.json` for inputs 1 and
2, and two were short texts written for this test for input 3.

## What worked

- One comparison went from an empty page to a summary line without an error:
  Use sample workflow, Continue, Continue to compare, Load sample results, six
  ratings, three notes. The summary read "Compared model rated the same on 1 of
  3, better on 1, worse on 1." and each row showed its own result.
- The same path worked with outputs entered by hand. With five of six filled,
  the empty cell read `not tested`, had no rating controls, and the summary
  said "Compared model rated the same on 2 of 2. 1 input not tested."
- The form refused every incomplete set with a sentence next to the field: an
  empty input ("Input 2 is missing. All three inputs are needed."), an input of
  4,001 characters ("Input 2 is 1 character over the 4,000 character limit.",
  with the counter in red), a prompt without `{input}`, and the same model on
  both sides ("The two models must differ. Pick another model to compare
  with."). A German and Japanese input with an emoji was accepted and counted.
- Ratings and notes were still there after Back and Continue to compare, and
  after Edit outputs and Show comparison with no text changed.
- All six ratings could be set with the keyboard alone (Tab, Space, arrow
  keys), with a visible focus ring on the rating in focus.
- At phone width nothing scrolled sideways at any of the four widths tried.

## Issues

22 issues. Each was seen in the browser on the commit above. Issues 1, 2 and 3
have since been fixed and carry a status line; the rest are open.

### 1. Loaded outputs stay in the table under a model that did not produce them

- **Where:** comparison table
- **Kind:** broken state
- **Steps:** Use sample workflow, Continue, Continue to compare, Load sample
  results, rate the outputs. Back, Edit, change "Model to compare with" to
  `openai/gpt-6-sol`, Continue, Continue to compare, Show comparison.
- **What happened:** the column header read `openai/gpt-6-sol`, and under it
  sat the three outputs that `openai/gpt-6-luna` returned, still tagged
  `sample run · 2026-10-03`, with their ratings and the row results in place.
  The summary line counted them. The sentence above the table still said the
  tagged outputs come from `anthropic/claude-sonnet-5.5` and
  `openai/gpt-6-luna`, so the page named two different models for one column.
- **Expected:** outputs and ratings do not carry over to a model they were not
  produced by.
- **Effect:** misleads
- **Status:** Fixed on Day 13 (Oct 7, 2026): on Continue, outputs under a changed model are removed with their ratings, and a notice says how many.

### 2. Outputs and ratings stay under an input whose text was changed

- **Where:** comparison table
- **Kind:** broken state
- **Steps:** with outputs loaded and rated as in issue 1, Back, Edit, replace
  the text of input 2 with a different email (a refund request was used),
  Continue, Continue to compare, Show comparison.
- **What happened:** row 2 showed the refund email as the input, and next to it
  the two replies about moving a meeting, tagged `sample run · 2026-10-03`,
  with both ratings, a 200 character note and the row result "Compared model:
  better" unchanged.
- **Expected:** an output and its rating do not stay under an input they were
  not written for.
- **Effect:** misleads
- **Status:** Fixed on Day 13 (Oct 7, 2026): on Continue, outputs under a changed input or a changed prompt are removed with their ratings, and a notice says how many.

### 3. The header describes a tool that runs prompts and ends in a decision, and the page does neither

- **Where:** whole page
- **Kind:** missing
- **Steps:** load the page and read the line under the title: "Run your own
  prompt on the model you use today and on a newer one, then decide: switch,
  stay, or test more." Go through to the summary line.
- **What happened:** nothing on the three screens runs a prompt. The first two
  screens do not say so. The third says "Run your prompt on each model yourself
  and paste what it returned. Nothing is run from this page." while the header
  above it still says "Run your own prompt on". After the summary line the page
  ends: the words switch, stay and test more appear only in the header.
- **Expected:** the first screen says what the person will have to do
  themselves, and the last screen leads to the decision the header names.
- **Effect:** misleads
- **Status:** Fixed on Day 13 (Oct 7, 2026): the header now says that the person runs both models and pastes the outputs, and that the decision stays theirs. The page still runs nothing and still ends at the summary line.

### 4. "Nothing is saved unless you choose to share the result" names a choice that does not exist

- **Where:** form
- **Kind:** missing
- **Steps:** read the line next to Continue. Complete a comparison with ratings
  and notes, then reload the page.
- **What happened:** no screen has a way to share, copy, save or export
  anything. The reload emptied the prompt, the three inputs, the six outputs,
  the six ratings and the three notes, with no warning before and no word
  after.
- **Expected:** either a way to share, or a line that says the work is gone
  when the page is closed or reloaded.
- **Effect:** misleads
- **Status:** Fixed on Oct 8, 2026: the line now reads "Nothing is saved. Reloading this page empties it." and is in the top bar on every step. There is still no way to share or save.

### 5. Text pasted by hand is tagged as coming from the sample run

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** reload, Use sample workflow, Continue, Continue to compare. Do not
  press Load sample results. Paste the saved output texts for inputs 1 and 2
  into the four fields, and other text into the two fields for input 3. Show
  comparison.
- **What happened:** the four cells were tagged `sample run · 2026-10-03`, the
  count read "outputs filled" instead of "outputs pasted", and the sentence
  "Outputs tagged sample run come from one run of ... through OpenRouter on
  2026-10-03, shown exactly as returned" appeared, for text that was pasted.
  The two other cells were tagged `pasted`.
- **Expected:** the tag says where this output came from, and it came from a
  paste.
- **Effect:** misleads (only when the pasted text is identical to a saved
  output)

### 6. There is no filled-in prompt to copy into a model

- **Where:** ready panel, comparison table
- **Kind:** missing
- **Steps:** Use sample workflow, Continue, Continue to compare. Try to get the
  prompt with input 1 in it, to paste into the first model.
- **What happened:** the comparison screen shows neither the prompt nor a full
  input, only the first 90 characters of each input. The ready panel shows the
  prompt with `{input}` still in it and the first 180 characters of each input.
  The full inputs are only on the form. The person has to press Back, then
  Edit, copy the prompt, copy an input, put the two together by hand, and do
  that three times for each of two models.
- **Expected:** the text to give each model can be read and copied from the
  screen that asks for its output.
- **Effect:** slows
- **Status:** Fixed on Oct 8, 2026: each of the six tasks in the outputs step has a Copy the filled-in prompt button, and the same text can be read on the page.

### 7. A one-character change to an output drops its rating and note without a word

- **Where:** comparison table
- **Kind:** broken state
- **Steps:** with six outputs rated, press Edit outputs, add one space at the
  end of the first output, Show comparison.
- **What happened:** that cell read "Your rating: not rated", its 77 character
  note was gone, its tag had changed from `sample run` to `pasted`, and the
  summary went back to "1 input still needs a rating." While the outputs are
  being edited, no rating or note is on screen and nothing says that a change
  clears them.
- **Expected:** the person is told before or after that the rating and note
  were removed.
- **Effect:** slows
- **Status:** Fixed on Oct 8, 2026: the rule stays, and a line next to the output now says that its rating and note were removed because its text changed.

### 8. Load sample results replaces pasted outputs without asking

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** paste and rate six outputs as in issue 5, then press Load sample
  results.
- **What happened:** the two pasted outputs for input 3 and their ratings were
  replaced at once. There was no question and no way back. The sentence next to
  the button does say "Loading replaces what is in the table." The button is
  also still offered after the results are loaded.
- **Expected:** a question before pasted work is replaced, or a way to undo it.
- **Effect:** slows
- **Status:** Fixed on Oct 8, 2026: Load sample results asks first when pasted outputs would be replaced, with Replace my outputs and Keep mine.

### 9. Use sample workflow replaces what was typed without asking

- **Where:** form
- **Kind:** confusing
- **Steps:** type a prompt, change an input, pick `openai/gpt-6-sol` as the
  model in use today, then press Use sample workflow.
- **What happened:** the prompt, all three inputs and both model choices were
  replaced with the sample and the default pair, with no question and no way
  back.
- **Expected:** a question before typed text is replaced.
- **Effect:** slows
- **Status:** Fixed on Oct 8, 2026: Use sample workflow asks first when a typed draft would be replaced, with Replace my draft and Keep mine.

### 10. Back and Continue to compare hides the ratings

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** with six outputs rated and the summary showing, press Back, then
  Continue to compare.
- **What happened:** the table came back as six editable text fields with a
  Show comparison button. The ratings, the notes, the row results and the
  summary line were not on screen, and the count line only said "6 of 6 outputs
  filled". They reappeared, unchanged, after Show comparison was pressed again.
- **Expected:** the person lands where they left, or is told the ratings are
  kept.
- **Effect:** slows
- **Status:** Fixed on Oct 8, 2026: pasting and rating are separate steps, and going to the outputs step and back shows the ratings as they were.

### 11. The summary line is out of sight when the last rating is set

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** load the sample results at desktop width and rate the six outputs
  from top to bottom.
- **What happened:** the page was 3,414 px tall. The summary line is above the
  table. When the sixth rating was set the page was scrolled about 2,390 px
  down, and the only visible change was the row's own "Compared model: worse".
  Nothing near the last rating said that all inputs were now rated. The notes
  do not appear in the summary.
- **Expected:** the result of rating everything can be seen from where the
  rating was done.
- **Effect:** slows
- **Status:** Fixed on Oct 8, 2026 and re-checked in the browser at 1440 x 900: the summary line sits in the top band, above the outputs, and the ratings are under them in the same window, so the page does not scroll while rating. At 1280 x 720 the page scrolls by about 40 px.

### 12. Two different outputs that both need edits read "same rating"

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** load the sample results, rate both outputs for input 1 Needs
  edits.
- **What happened:** the row read "Compared model: same rating" and the summary
  counted it under "rated the same on 1 of 3". The two outputs were 1,449 and
  355 characters long and needed different edits. The count is correct for the
  ratings, and it reads as if the two models did equally well on that input.
- **Expected:** a person can tell "got the same rating" apart from "is as
  good".
- **Effect:** slows

### 13. Cost and speed are not on any screen

- **Where:** whole page
- **Kind:** missing
- **Steps:** go through all three screens with the sample results loaded and
  look for a cost, a price, a time or a token count.
- **What happened:** there is none. The spec lists cost and speed as two of the
  three things compared, and the saved results file holds token counts and
  response times for all six outputs.
- **Expected:** already known and planned. It is on the list so the list is
  complete.
- **Effect:** slows (the decision rests on ratings alone)
- **Status:** Fixed on Day 14 (Oct 8, 2026) for the saved sample run: each model shows an estimated cost per 1,000 runs with the price source and date, and the measured response times of the run. Outputs pasted by hand read `not measured`.

### 14. Load sample results disappears with no reason given

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** as in issue 1 or issue 2: change a model or an input of the
  sample, go back to the comparison.
- **What happened:** the Load sample results button and its sentence were gone.
  Nothing said why, or what would bring them back.
- **Expected:** a line saying the saved results belong to the unchanged sample
  on the default pair.
- **Effect:** slows
- **Status:** Fixed on Oct 8, 2026: when the saved results are not offered for a changed sample, a line in the outputs step says which draft they belong to.

### 15. The two rating groups in one row sit far apart

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** load the sample results at desktop width and rate both outputs
  for input 1, with the mouse or with Tab.
- **What happened:** each rating group sits under its output, and the first
  output is about four times as long as the second. With the keyboard, moving
  from the first output's rating to the second's scrolled the page from about
  1,270 px back up to about 550 px. The two outputs being compared cannot be
  rated from one scroll position.
- **Expected:** the two ratings for one input can be reached together.
- **Effect:** slows
- **Status:** Fixed on Oct 8, 2026 and re-checked in the browser at 1440 x 900 and 1280 x 720: the two rating groups for one input sit side by side at the same height, under their outputs, and are reached from one scroll position.

### 16. At phone width the table needs a very long scroll

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** open the page 386 px wide, Use sample workflow, Continue, Continue
  to compare, Load sample results.
- **What happened:** the columns were 68, 135 and 135 px wide. The paste fields
  were 111 px wide. With the results loaded the page was 6,425 px tall and the
  first row alone 2,457 px. The input column broke words in the middle
  ("Septem" / "be…"), the SAMPLE tag ran past the edge of its column, the
  `sample run` tag wrapped onto two lines, and each rating choice was 25 px
  tall. Everything could be read, pasted into and rated, and nothing scrolled
  sideways.
- **Expected:** two outputs for one input can be compared without scrolling
  several screens between them.
- **Effect:** slows

### 17. `{input}` twice in the prompt is accepted without a word

- **Where:** form, ready panel
- **Kind:** confusing
- **Steps:** with the sample loaded, change the prompt to contain `{input}`
  twice, Continue.
- **What happened:** the form accepted it. The ready panel showed the prompt
  with both placeholders. Nothing said whether the input goes into both places
  or only the first.
- **Expected:** the page says what happens to a second placeholder.
- **Effect:** slows

### 18. `{Input}` with a capital letter gets the "no placeholder" message

- **Where:** form
- **Kind:** confusing
- **Steps:** change the prompt to "Triage this email: {Input}", press Continue.
- **What happened:** the message read "The prompt has no {input} placeholder.
  It marks the spot where each of your three inputs is put into the prompt, so
  both models read exactly the same thing." It does not say that the capital
  letter is the problem.
- **Expected:** a person who typed `{Input}` can see what to change.
- **Effect:** slows

### 19. A note stops at 200 characters with no signal

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** type a note of about 250 characters under an output.
- **What happened:** typing stopped having any effect at 200 characters, in the
  middle of a sentence. The counter read "200 / 200" in the same grey as
  before, and no message appeared. The note field is one line: a 77 character
  note showed only its last few words.
- **Expected:** the person sees that the limit was reached, and can read back
  what they wrote.
- **Effect:** cosmetic

### 20. Outputs show their formatting marks as plain characters

- **Where:** comparison table
- **Kind:** confusing
- **Steps:** load the sample results and read any output.
- **What happened:** all six outputs showed marks such as `**1. Priority:**`
  and lines starting with `>`. The page says the outputs are "shown exactly as
  returned", which is true.
- **Expected:** a first-time reader is not left wondering whether the asterisks
  are a fault of the model or of the page.
- **Effect:** cosmetic

### 21. Keyboard focus is on nothing after each change of screen

- **Where:** whole page
- **Kind:** confusing
- **Steps:** focus Continue on a complete form and press Enter. Then Tab to
  Continue to compare and press Enter.
- **What happened:** after both, the focus was on the page body, not on the new
  screen's heading or first control, and nothing announced the new screen. The
  next Tab started again from the top of the page.
- **Expected:** focus moves to the new screen.
- **Effect:** cosmetic
- **Status:** Fixed on Oct 8, 2026: after each step change, focus is on the new step's heading.

### 22. The character counter and the limit are written two ways

- **Where:** form
- **Kind:** confusing
- **Steps:** put 4,001 characters into an input, press Continue.
- **What happened:** the counter read "4001 / 4000" and the message next to it
  read "4,000 character limit".
- **Expected:** one way of writing the number.
- **Effect:** cosmetic

## Not reproduced

- **Keyboard only.** All six ratings were set with Tab, Space and the arrow
  keys. Each rating group sits directly under its output and carries a hidden
  label naming the model and the input, and the rating in focus had a visible
  ring. Issue 15 and issue 21 are what the keyboard pass did turn up.
- **Phone width, sideways scrolling.** The page was no wider than the screen
  at 316, 356, 386 or 410 px, on the form, the ready panel and the table.
- **Ratings lost on Back.** They were kept. What happened instead is issue 10.
- **Awkward inputs on the form.** The empty input, the 4,001 character input,
  the non-English input, the prompt without `{input}` and the same model on
  both sides were each handled with a sentence that says what to do. Only
  `{input}` twice (issue 17) and `{Input}` (issue 18) went on the list.

## Fix first

1. **Issue 1, loaded outputs under a different model.** The table shows one
   model's outputs and ratings under another model's name, and the summary
   counts them. It is the one state where the comparison itself is untrue.
2. **Issue 2, outputs and ratings under a changed input.** The same fault from
   the other side: a row result of "better" stands next to an input neither
   output was written for.
3. **Issue 3, the header.** It is the first sentence a member reads, and it
   says the tool runs the prompt and ends in a decision. Until the tool does
   both, the sentence promises what the next three screens do not do.

Issue 6 (no filled-in prompt to copy) is the largest of the ones that only slow
a person down, and is next after these three.

## Not covered

- No person went through the flow. Nobody other than the automated session
  has tried it, so nothing here says where a first-time member hesitates.
- No live model calls. The pasted outputs were saved outputs and two written
  texts, not fresh answers from the two models.
- Not tried: dark mode (the test browser could not be switched to it), a real
  phone, a screen reader, any browser other than Chrome, and a deployed build.
  The test ran against the local development server only.
