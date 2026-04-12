import { describe, expect, it } from "vitest";
import {
  createEmptySettingsGraphMotionPerfLongTaskBreakdown,
  summarizeSettingsGraphMotionPerfLongTaskBreakdown,
} from "./settingsGraphMotionPerfPhases";

describe("settingsGraphMotionPerfPhases", () => {
  it("returns a zeroed breakdown when no long-task records were captured", () => {
    expect(summarizeSettingsGraphMotionPerfLongTaskBreakdown([])).toEqual(
      createEmptySettingsGraphMotionPerfLongTaskBreakdown(),
    );
  });

  it("groups long-task records by motion phase", () => {
    expect(
      summarizeSettingsGraphMotionPerfLongTaskBreakdown([
        { durationMs: 120, phase: "captureWarmup" },
        { durationMs: 40, phase: "captureWarmup" },
        { durationMs: 310, phase: "zoomIn" },
        { durationMs: 50, phase: "postSequenceSettle" },
      ]),
    ).toEqual({
      captureWarmup: {
        count: 2,
        maxDurationMs: 120,
        totalDurationMs: 160,
      },
      panForward: {
        count: 0,
        maxDurationMs: 0,
        totalDurationMs: 0,
      },
      panReturn: {
        count: 0,
        maxDurationMs: 0,
        totalDurationMs: 0,
      },
      zoomIn: {
        count: 1,
        maxDurationMs: 310,
        totalDurationMs: 310,
      },
      zoomOut: {
        count: 0,
        maxDurationMs: 0,
        totalDurationMs: 0,
      },
      postSequenceSettle: {
        count: 1,
        maxDurationMs: 50,
        totalDurationMs: 50,
      },
      unknown: {
        count: 0,
        maxDurationMs: 0,
        totalDurationMs: 0,
      },
    });
  });
});
