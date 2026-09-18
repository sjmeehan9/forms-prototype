import type { UxpJob, UxpResult } from "@prototype/contracts";
import { PrototypeError } from "../../domain/models.js";
import type { CompositionAdapter } from "../types.js";

/** Placeholder for Firefly Services InDesign API composition. Entitlement on a personal account is unproven. */
export class FireflyCompositionStub implements CompositionAdapter {
  async submit(job: UxpJob): Promise<void> {
    throw new PrototypeError("compose", `Firefly Services InDesign API composition is not implemented (job ${job.jobId}); set COMPOSITION_MODE=uxp`);
  }

  async wait(jobId: string): Promise<UxpResult> {
    throw new PrototypeError("compose", `Firefly Services InDesign API composition is not implemented (job ${jobId}); set COMPOSITION_MODE=uxp`);
  }
}
