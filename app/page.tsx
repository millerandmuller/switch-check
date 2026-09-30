import candidatesConfig from "@/config/candidates.json";
import sampleWorkflow from "@/demo-data/sample-email-triage.json";
import { WorkflowForm } from "./workflow-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Switch Check</h1>
      <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
        Run your own prompt on the model you use today and on a newer one, then decide: switch, stay, or test more.
      </p>
      <div className="mt-10">
        <WorkflowForm
          candidates={candidatesConfig.candidates}
          defaultPair={candidatesConfig.default_pair}
          sample={sampleWorkflow}
        />
      </div>
    </main>
  );
}
