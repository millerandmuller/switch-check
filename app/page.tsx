import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import candidatesConfig from "@/config/candidates.json";
import sampleWorkflow from "@/demo-data/sample-email-triage.json";
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

export default function Home() {
  const sampleResults = readSampleResults();
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Switch Check</h1>
      <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
        Compare the model you use today with a newer one on your own prompt and three inputs. For
        now you run both models yourself and paste what they returned. Switch Check puts the
        outputs side by side and counts your ratings. The decision stays yours: switch, stay, or
        test more.
      </p>
      <div className="mt-10">
        <WorkflowForm
          candidates={candidatesConfig.candidates}
          defaultPair={candidatesConfig.default_pair}
          sample={sampleWorkflow}
          sampleResults={sampleResults}
        />
      </div>
    </main>
  );
}
