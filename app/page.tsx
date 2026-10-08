import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import candidatesConfig from "@/config/candidates.json";
import sampleWorkflow from "@/demo-data/sample-email-triage.json";
import type { ModelPrices } from "@/lib/cost-speed";
import { newestResultsFileName, type SampleResults } from "@/lib/sample-results";
import { WorkflowForm } from "./workflow-form";

// The newest saved run of the sample workflow, read on the server when the
// page is built. null when no run has been saved yet.
function readSampleResults(): SampleResults | null {
  const demoData = path.join(process.cwd(), "demo-data");
  const fileName = newestResultsFileName(readdirSync(demoData));
  if (fileName === null) return null;
  return JSON.parse(readFileSync(path.join(demoData, fileName), "utf8"));
}

// The published prices as `npm run check-models` last read them, with their
// source and date. null when the check has never been run.
function readModelPrices(): ModelPrices | null {
  const file = path.join(process.cwd(), "config", "model-prices.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export default function Home() {
  const sampleResults = readSampleResults();
  const modelPrices = readModelPrices();
  return (
    <main className="w-full">
      <header className="border-b border-ink px-gutter py-3">
        <h1 className="font-display text-[1.55rem] font-medium tracking-[-0.01em]">
          Switch Check <i className="font-normal text-gold">your call</i>
        </h1>
      </header>
      <p className="max-w-[72ch] px-gutter pt-8 text-lg text-muted">
        Compare the model you use today with a newer one on your own prompt and three inputs. For
        now you run both models yourself and paste what they returned. Switch Check puts the
        outputs side by side and counts your ratings. The decision stays yours: switch, stay, or
        test more.
      </p>
      <div className="px-gutter pb-16 pt-8">
        <WorkflowForm
          candidates={candidatesConfig.candidates}
          defaultPair={candidatesConfig.default_pair}
          sample={sampleWorkflow}
          sampleResults={sampleResults}
          modelPrices={modelPrices}
        />
      </div>
    </main>
  );
}
