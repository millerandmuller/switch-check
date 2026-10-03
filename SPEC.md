# Switch Check: spec

## Who it's for

People who run AI workflows for clients or for themselves, like email triage, lead scoring, support replies or content drafts. Most of these were set up on one model months ago. When a new model comes out, the question is always the same: should I switch? Answering it by hand means copying the same prompt and inputs into several playgrounds and comparing the results in a spreadsheet. So most people never check.

## The decision it helps with

For one workflow: switch to a newer model, stay on the current one, or test more before deciding.

## Inputs

- One prompt the person already uses, with an `{input}` placeholder where the real input goes
- Three real inputs, each up to 4,000 characters
- The model they use today, and the model they want to compare it with

Nothing is saved unless the person chooses to share the result.

## First version: two models

The first version compares exactly two models: the current one and one candidate. Both get the same prompt and the same three inputs. More candidates come later, once the two-model comparison works reliably.

## What you see

- The two outputs side by side for each input
- Cost: estimated cost per 1,000 runs for each model, calculated from the provider's published per-token price and the tokens each run actually used. The price source and date are shown next to the number.
- Speed: how long each model took to answer
- Quality: the person rates each model's output on a three-point scale (usable as is, needs edits, not usable) and can add a one-line note. Better, same or worse for the compared model follows from those two ratings, input by input. The tool doesn't pick a winner on their behalf. A later version will suggest a mark with a one-line reason, which the person can always change.
- A summary line from those choices, for example: "Same result on 3 of 3, 78% cheaper."

If a model doesn't answer, it's marked "not tested", not "worse".

## Out of scope

- Accounts or logins
- Storing prompts by default
- Public model rankings or averages across other people's prompts
- Multi-turn chats, agents, images or audio
- Security scanning
- Switching anyone's live workflow automatically. The tool helps you decide, and you make the change yourself.

## Example workflow: client email triage

A prompt that reads an incoming client email and returns three things: priority (urgent / normal / low), category (billing, scheduling, question, spam) and a short reply draft.

The three example inputs are made-up emails, labeled as samples in the app:

1. A client disputing an invoice that is overdue
2. A client asking to move tomorrow's meeting
3. A newsletter that landed in the inbox

What counts as worse here: a wrong priority, a missing field, or a reply draft that promises something the email didn't ask for.
