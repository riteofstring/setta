import { type AgentRun } from "utils/generatedTypes";

type RunInputs = Record<string, unknown>;

function getRunInputs(run: AgentRun): RunInputs | null {
  const inputs = run.inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return null;
  }
  return inputs as RunInputs;
}

export function getRunInputString(run: AgentRun, key: string): string | null {
  const inputs = getRunInputs(run);
  if (!inputs) {
    return null;
  }
  const raw = inputs[key];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return null;
}

export function getRunInputNumber(run: AgentRun, key: string): number | null {
  const inputs = getRunInputs(run);
  if (!inputs) {
    return null;
  }
  const raw = inputs[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  return null;
}

export function getRunLastUpdatedMs(run: AgentRun): number {
  const eventTimestamps = (run.events ?? [])
    .map((event) => Date.parse(event.timestamp ?? ""))
    .filter((value) => !Number.isNaN(value));
  if (eventTimestamps.length > 0) {
    return Math.max(...eventTimestamps);
  }
  const finishedAt = Date.parse(run.finishedAt ?? "");
  if (!Number.isNaN(finishedAt)) {
    return finishedAt;
  }
  const startedAt = Date.parse(run.startedAt ?? "");
  if (!Number.isNaN(startedAt)) {
    return startedAt;
  }
  return 0;
}
