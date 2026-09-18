import { app } from "indesign";
import { flattenAggregatedResults } from "./preflight-results";
import { messageOf } from "./text-model";

export type PreflightOutcome = { errors: string[]; notes: string[] };

/** Run the [Basic] preflight profile (or the first available) and return machine-readable findings. */
export function runPreflight(doc: any): PreflightOutcome {
  try {
    let profile = app.preflightProfiles.itemByName("[Basic]");
    if (!profile || !profile.isValid) {
      profile = app.preflightProfiles.firstItem();
    }
    const process = app.preflightProcesses.add(doc, profile);
    process.waitForProcess(60);
    const results = process.aggregatedResults;
    process.remove();
    return { errors: flattenAggregatedResults(results), notes: [] };
  } catch (error) {
    return { errors: [], notes: [`preflight skipped: ${messageOf(error)}`] };
  }
}
