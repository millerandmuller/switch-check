// Tests for the filled-in prompt: the text a person copies into a model.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { filledPrompt } from "../../lib/workflow.ts";

test("one placeholder is replaced by the input", () => {
  assert.equal(filledPrompt("Triage this.\n\nEmail: {input}", "Hi, the invoice is wrong."), "Triage this.\n\nEmail: Hi, the invoice is wrong.");
});

test("every placeholder is replaced when the prompt has two", () => {
  assert.equal(filledPrompt("Read: {input}\nNow answer about: {input}", "the email"), "Read: the email\nNow answer about: the email");
});

test("an input that itself contains {input} is put in as it is, once per placeholder", () => {
  assert.equal(filledPrompt("A: {input} B: {input}", "use {input} here"), "A: use {input} here B: use {input} here");
});

test("dollar signs and other pattern characters in the input are kept as typed", () => {
  assert.equal(filledPrompt("Email: {input}", "It costs $450, see $& and $1."), "Email: It costs $450, see $& and $1.");
});

test("a prompt without a placeholder comes back unchanged", () => {
  assert.equal(filledPrompt("No placeholder here.", "ignored"), "No placeholder here.");
});

test("the shipped sample fills to the prompt followed by the whole first email", async () => {
  const path = fileURLToPath(new URL("../../demo-data/sample-email-triage.json", import.meta.url));
  const sample = JSON.parse(await readFile(path, "utf8"));
  const filled = filledPrompt(sample.prompt, sample.inputs[0].text);
  assert.equal(filled.includes("{input}"), false);
  assert.equal(filled.endsWith(`Email: ${sample.inputs[0].text}`), true);
});
