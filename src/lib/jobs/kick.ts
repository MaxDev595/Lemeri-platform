import { after } from "next/server";
import { captureOperationalError } from "@/lib/observability/logger";

// Background jobs (knowledge indexing, website crawls, CRM delivery) are normally
// drained by POST /api/internal/jobs/run on a schedule. Nothing runs that
// schedule in local development, and the Worker has no cron trigger configured,
// so freshly added knowledge stayed "processing" and was never used by the AI.
// Draining a small batch right after the response keeps new work moving; the
// scheduled runner remains the safety net for retries.
export function drainJobsAfterResponse(limit = 5) {
  try {
    after(async () => {
      try {
        const { runJobBatch } = await import("./worker");
        await runJobBatch(limit);
      } catch (error) {
        await captureOperationalError({ category: "JOBS", code: "INLINE_JOB_RUN_FAILED", message: error instanceof Error ? error.message : "Inline job run failed" }).catch(() => undefined);
      }
    });
  } catch {
    // Outside a request scope (scripts, tests) there is nothing to schedule.
  }
}
