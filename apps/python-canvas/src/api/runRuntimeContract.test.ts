import { describe, expect, it, vi } from "vitest";
import { runGeneratedProgram } from "./client";
import { parseGeneratedProgramRunResult } from "./runRuntimeContract";

const result = {
  projectId: "rover-mission",
  revision: 4,
  stdout: "hello",
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
  exitCode: 0,
  terminationReason: "exited",
  elapsedMilliseconds: 12,
};

describe("generated program run boundary", () => {
  it("binds an executed result to the requested project and revision", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(result)));
    const request = {
      projectId: "rover-mission",
      expectedRevision: 4,
      runTimeoutMilliseconds: 30000,
    };
    await expect(
      runGeneratedProgram(request, undefined, fetch),
    ).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v2/project/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
    await expect(
      runGeneratedProgram(
        { ...request, expectedRevision: 5 },
        undefined,
        fetch,
      ),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("accepts bounded termination and rejects inconsistent exit records", () => {
    const { exitCode: _code, ...withoutExit } = result;
    expect(
      parseGeneratedProgramRunResult({
        ...withoutExit,
        terminationReason: "timed_out",
      }).terminationReason,
    ).toBe("timed_out");
    expect(() =>
      parseGeneratedProgramRunResult({
        ...result,
        terminationReason: "timed_out",
      }),
    ).toThrow();
    expect(() => parseGeneratedProgramRunResult(withoutExit)).toThrow();
  });
});
