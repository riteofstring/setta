import type { GeneratedProgramRunResultV2 } from "./generatedContract";
import {
  fail,
  readBoolean,
  readClosedRecord,
  readNonBlankString,
  readNonNegativeInteger,
  readOption,
  readPositiveInteger,
  readText,
} from "./runtimeContractPrimitives";

export function parseGeneratedProgramRunResult(
  value: unknown,
): GeneratedProgramRunResultV2 {
  const field = "generated program result";
  const record = readClosedRecord(value, field, [
    "projectId",
    "revision",
    "stdout",
    "stderr",
    "stdoutTruncated",
    "stderrTruncated",
    "terminationReason",
    "elapsedMilliseconds",
    ...(typeof value === "object" && value !== null && "exitCode" in value
      ? ["exitCode"]
      : []),
  ]);
  const terminationReason = readOption(record.terminationReason, field, [
    "exited",
    "signaled",
    "timed_out",
    "output_limit",
  ] as const);
  if ((terminationReason === "exited") !== (record.exitCode !== undefined)) {
    fail(field, "exit code does not match termination reason");
  }
  return {
    projectId: readNonBlankString(record.projectId, `${field}.projectId`),
    revision: readPositiveInteger(record.revision, `${field}.revision`),
    stdout: readText(record.stdout, `${field}.stdout`, true),
    stderr: readText(record.stderr, `${field}.stderr`, true),
    stdoutTruncated: readBoolean(
      record.stdoutTruncated,
      `${field}.stdoutTruncated`,
    ),
    stderrTruncated: readBoolean(
      record.stderrTruncated,
      `${field}.stderrTruncated`,
    ),
    elapsedMilliseconds: readNonNegativeInteger(
      record.elapsedMilliseconds,
      `${field}.elapsedMilliseconds`,
    ),
    terminationReason,
    ...(record.exitCode === undefined
      ? {}
      : {
          exitCode: readNonNegativeInteger(
            record.exitCode,
            `${field}.exitCode`,
          ),
        }),
  };
}
