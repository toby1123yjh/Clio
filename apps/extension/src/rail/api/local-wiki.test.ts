import { describe, expect, it } from "vitest";
import {
  wikiArtifactFreshnessLabel,
  wikiArtifactJsonValueLabel,
  wikiArtifactKindLabel,
  wikiCompileCreateResultMessage,
  wikiCompileRunCanCancel,
  wikiCompileRunCanResume,
  wikiCompileRunCanRetry,
  wikiCompileRunProgress,
  wikiCompileRunStatusLabel,
} from "./local-wiki";

describe("local Wiki presentation", () => {
  it("uses stable product labels for artifact and run states", () => {
    expect(wikiArtifactKindLabel("source_digest")).toBe("Source digest");
    expect(wikiArtifactKindLabel("claim")).toBe("Claim");
    expect(wikiArtifactFreshnessLabel("fresh")).toBe("Current");
    expect(wikiArtifactFreshnessLabel("stale")).toBe("History");
    expect(wikiCompileRunStatusLabel("reducing")).toBe("Publishing");
    expect(wikiCompileRunStatusLabel("failed")).toBe("Failed");
  });

  it("formats structured metadata without unbounded detail text", () => {
    expect(wikiArtifactJsonValueLabel({ covered: 3 })).toBe('{"covered":3}');
    expect(wikiArtifactJsonValueLabel("x".repeat(200))).toHaveLength(160);
  });

  it("bounds persisted run progress and explains enqueue reuse", () => {
    expect(
      wikiCompileRunProgress({
        status: "running",
        stepCount: 3,
        completedStepCount: 2,
      } as never),
    ).toBe(67);
    expect(
      wikiCompileRunProgress({
        status: "completed",
        stepCount: 3,
        completedStepCount: 3,
      } as never),
    ).toBe(100);
    expect(wikiCompileCreateResultMessage({ disposition: "reused_artifact" })).toContain(
      "already current",
    );
    expect(wikiCompileCreateResultMessage({ disposition: "reused_run" })).toContain("existing");
  });

  it("projects backend run transitions into product action availability", () => {
    expect(wikiCompileRunCanCancel("running")).toBe(true);
    expect(wikiCompileRunCanCancel("completed")).toBe(false);
    expect(wikiCompileRunCanRetry("failed", true)).toBe(true);
    expect(wikiCompileRunCanRetry("failed", false)).toBe(false);
    expect(wikiCompileRunCanResume("paused", true)).toBe(true);
    expect(wikiCompileRunCanResume("paused", false)).toBe(false);
  });
});
