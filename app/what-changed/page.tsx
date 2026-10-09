import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "What changed · Switch Check",
  description: "How Switch Check changed after its first tester stopped halfway: five screens became one page that runs the models itself.",
};

const OLD_VERSION = "https://switch-check-v1.vercel.app";
const CHANGELOG = "https://github.com/millerandmuller/switch-check/blob/main/CHANGELOG.md";

// Counts in the table come from the code of the first version (the five-step
// flow, the paste step, the rating step) and from this one. They are counts of
// things, not measurements of anyone's time.
const ROWS: [string, string, string][] = [
  ["Screens", "5 steps", "1 page"],
  ["Required buttons before a result", "4, then six outputs pasted in by hand and six ratings", "1"],
  ["Models called by the app", "0. You ran them in other tools.", "Up to 4 you pick, plus one that writes the test and one that judges"],
  ["Who decides", "You. The page never suggested anything.", "The page proposes a verdict and you can overrule it"],
];

export default function WhatChanged() {
  return (
    <div className="ground flex min-h-dvh flex-col">
      <header className="relative px-gutter py-3">
        <Link href="/" className="font-display text-[1.3rem] font-semibold tracking-[-0.01em]">
          Switch Check
        </Link>
      </header>
      <main className="relative w-full flex-1 px-gutter pb-12 pt-4">
        <article className="panel mx-auto flex max-w-4xl flex-col gap-6 p-[clamp(16px,2.4vw,34px)] text-[16.5px] leading-relaxed">
          <h1 className="text-balance font-display text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
            What changed <span className="font-extralight text-soft">and why.</span>
          </h1>

          <section aria-labelledby="shots" className="flex flex-col gap-4">
            <h2 id="shots" className="sr-only">
              Before and after
            </h2>
            <figure className="card overflow-hidden p-3">
              <Image src="/what-changed/before.jpg" width={1484} height={669} alt="The first version, step 4 of 5: an Outputs screen with six boxes for outputs pasted in from other tools." className="h-auto w-full rounded-xl" />
              <figcaption className="mt-2 text-[13.5px] text-muted">
                <b>Before.</b> Step 4 of 5, shown with the sample&apos;s outputs loaded. With your own prompt the six boxes start empty: each output is run in another tool and pasted back. Still reachable at{" "}
                <a href={OLD_VERSION} className="font-semibold text-accent underline underline-offset-2">
                  switch-check-v1.vercel.app
                </a>
                .
              </figcaption>
            </figure>
            <figure className="card overflow-hidden p-3">
              <Image src="/what-changed/after.jpg" width={1568} height={707} alt="The new page showing a verdict sentence, the figures behind it each with a state, and the test cases that were written." className="h-auto w-full rounded-xl" />
              <figcaption className="mt-2 text-[13.5px] text-muted">
                <b>After.</b> One page. This is the recorded example of 2026-10-09, shown as recorded on the page itself: one sentence typed, one button pressed, a verdict with the figures behind it.
              </figcaption>
            </figure>
          </section>

          <section aria-labelledby="table-heading">
            <h2 id="table-heading" className="sr-only">
              Before and after in numbers
            </h2>
            <div className="card overflow-x-auto p-2">
              <table className="w-full min-w-[34rem] text-left text-[15px]">
                <thead>
                  <tr className="text-[13.5px] text-muted">
                    <th className="px-3 py-2 font-medium" />
                    <th className="px-3 py-2 font-medium">Before</th>
                    <th className="px-3 py-2 font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(([label, before, after]) => (
                    <tr key={label} className="border-t border-line align-top">
                      <th scope="row" className="px-3 py-2 font-semibold">
                        {label}
                      </th>
                      <td className="px-3 py-2">{before}</td>
                      <td className="px-3 py-2">{after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <p>
              <b>What the first tester got stuck on.</b> The first person to try it got as far as the fourth step and stopped. The page asked them to open two other products, run a prompt six times, and paste the answers back. The part that makes the tool useful, seeing two models side by side, came after all of that work. They also said they had to learn a placeholder before anything happened.
            </p>
            <p>
              <b>What was decided.</b> The page now does the running. You type the task in plain words and press one button. The page writes a prompt, three test cases and a few yes or no checks, runs the models you picked, has a judge that cannot see model names mark the answers, and says which model to use and why. Every figure says whether it was measured, estimated, generated, judged or recorded. The old rule that the tool never suggests a decision is gone, because a person who has just seen a result wants it said out loud. You can still flip any check, edit any test case and run again, and the verdict follows.
            </p>
            <p>
              <b>What was kept.</b> The look, the wording of &ldquo;estimated&rdquo; and &ldquo;not tested&rdquo;, the dated prices, the rule that a model that does not answer is never counted as worse, and the habit of testing every rule that decides a figure before it gets a screen.
            </p>
          </section>

          <p className="text-[15px]">
            The full list of changes, with what was decided, added, changed and missed, is in the{" "}
            <a href={CHANGELOG} className="font-semibold text-accent underline underline-offset-2">
              changelog
            </a>
            .
          </p>
          <p>
            <Link href="/" className="font-semibold text-accent underline underline-offset-2">
              Back to the page
            </Link>
          </p>
        </article>
      </main>
    </div>
  );
}
