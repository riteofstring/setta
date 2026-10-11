import { useEffect, useState } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
} from "@riteofstring/setta";

import { realtimeAutomaticStartupSource } from "../app/realtimeGraph";
import { useRealtime } from "../app/runtimeContext";
import type { Binding, JsonValue, Project } from "../api/generatedContract";
import { readHandlerSectionData } from "./sectionData";

const HANDLER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAXIMUM_BINDING_ARGUMENTS = 128;
const MAXIMUM_BINDING_OUTPUTS = 128;

function parseArguments(value: string): Record<string, JsonValue> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, JsonValue>)
      : null;
  } catch {
    return null;
  }
}

function invalidReference(
  value: JsonValue,
  sections: Project["sections"],
): boolean {
  if (typeof value !== "string" || !value.startsWith("$")) {
    return false;
  }
  if (value.startsWith("$event.")) {
    return value.slice("$event.".length).length === 0;
  }
  if (value.startsWith("$sections.")) {
    const parts = value.split(".");
    return (
      parts.length < 3 ||
      !Object.hasOwn(sections, parts[1] ?? "") ||
      (parts[2] ?? "").length === 0
    );
  }
  return true;
}

function argumentsError(
  value: Record<string, JsonValue>,
  binding: Binding,
  project: Project,
): string | null {
  const names = Object.keys(value);
  if (names.length > MAXIMUM_BINDING_ARGUMENTS) {
    return `Arguments cannot contain more than ${MAXIMUM_BINDING_ARGUMENTS} entries.`;
  }
  const invalidName = names.find((name) => !HANDLER_NAME_PATTERN.test(name));
  if (invalidName !== undefined) {
    return `Argument name ${JSON.stringify(invalidName)} must be a valid Python parameter name.`;
  }
  if (binding.trigger.kind === "join") {
    const inputs = binding.trigger.inputs;
    const collision = names.find((name) => Object.hasOwn(inputs, name));
    if (collision !== undefined) {
      return `Argument ${JSON.stringify(collision)} is supplied by a connected input.`;
    }
  }
  const invalidArgumentReference = Object.entries(value).find(([, argument]) =>
    invalidReference(argument, project.sections),
  );
  return invalidArgumentReference === undefined
    ? null
    : `Argument ${JSON.stringify(invalidArgumentReference[0])} has an invalid reference.`;
}

function parseOutputNames(value: string): string[] | string {
  if (value.trim().length === 0) {
    return [];
  }
  const names = value.split(",").map((name) => name.trim());
  if (names.some((name) => !HANDLER_NAME_PATTERN.test(name))) {
    return "Outputs must be comma-separated valid Python names.";
  }
  if (new Set(names).size !== names.length) {
    return "Output names must be unique.";
  }
  return names.length > MAXIMUM_BINDING_OUTPUTS
    ? `Outputs cannot contain more than ${MAXIMUM_BINDING_OUTPUTS} entries.`
    : names;
}

function parseBoundedInteger(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): number | string {
  const parsed = Number(value);
  return value.trim().length > 0 &&
    Number.isInteger(parsed) &&
    parsed >= minimum &&
    parsed <= maximum
    ? parsed
    : `${label} must be a whole number from ${minimum} through ${maximum}.`;
}

export function HandlerInspector({ data }: { data: unknown }) {
  const { actions, project, runtime } = useRealtime();
  const { bindingId } = readHandlerSectionData(data);
  const binding = project.bindings.find(
    (candidate) => candidate.id === bindingId,
  );
  const [argumentsDraft, setArgumentsDraft] = useState("");
  const [outputDraft, setOutputDraft] = useState("");
  const [concurrencyGroupDraft, setConcurrencyGroupDraft] = useState("");
  const [debounceDraft, setDebounceDraft] = useState("");
  const [concurrencyLimitDraft, setConcurrencyLimitDraft] = useState("");
  const [shapeFeedback, setShapeFeedback] = useState<string | null>(null);
  const [schedulingFeedback, setSchedulingFeedback] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (binding !== undefined) {
      setArgumentsDraft(JSON.stringify(binding.arguments, null, 2));
      setOutputDraft(Object.keys(binding.outputs).sort().join(", "));
      setConcurrencyGroupDraft(binding.scheduling.concurrencyGroup);
      setDebounceDraft(String(binding.scheduling.debounceMilliseconds));
      setConcurrencyLimitDraft(String(binding.scheduling.concurrencyLimit));
      setShapeFeedback(null);
      setSchedulingFeedback(null);
    }
  }, [binding]);
  if (binding === undefined) {
    return <p role="alert">Binding {bindingId} is missing.</p>;
  }
  const allowsAutomaticStartup =
    realtimeAutomaticStartupSource(project, bindingId) !== null;
  const interactionClassName = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
  const saveShape = async () => {
    const argumentsValue = parseArguments(argumentsDraft);
    if (argumentsValue === null) {
      setShapeFeedback("Arguments must be a JSON object.");
      return;
    }
    const argumentProblem = argumentsError(argumentsValue, binding, project);
    if (argumentProblem !== null) {
      setShapeFeedback(argumentProblem);
      return;
    }
    const outputNames = parseOutputNames(outputDraft);
    if (typeof outputNames === "string") {
      setShapeFeedback(outputNames);
      return;
    }
    const saved = await actions.updateBinding(bindingId, {
      arguments: argumentsValue,
      outputNames,
    });
    setShapeFeedback(
      saved ? "Binding shape saved." : "Binding shape was not saved.",
    );
  };
  const saveScheduling = async () => {
    if (!ID_PATTERN.test(concurrencyGroupDraft)) {
      setSchedulingFeedback(
        "Concurrency group must be 1–128 letters, numbers, dots, underscores, colons, or hyphens and start with a letter or number.",
      );
      return;
    }
    const debounceMilliseconds = parseBoundedInteger(
      debounceDraft,
      "Debounce milliseconds",
      0,
      60_000,
    );
    if (typeof debounceMilliseconds === "string") {
      setSchedulingFeedback(debounceMilliseconds);
      return;
    }
    const concurrencyLimit = parseBoundedInteger(
      concurrencyLimitDraft,
      "Concurrency limit",
      1,
      64,
    );
    if (typeof concurrencyLimit === "string") {
      setSchedulingFeedback(concurrencyLimit);
      return;
    }
    const saved = await actions.updateBinding(bindingId, {
      scheduling: {
        concurrencyGroup: concurrencyGroupDraft,
        concurrencyLimit,
        debounceMilliseconds,
      },
    });
    setSchedulingFeedback(
      saved ? "Scheduling saved." : "Scheduling was not saved.",
    );
  };
  return (
    <section className="realtime-handler-inspector">
      <WorkspaceInspectorSettingsGroup
        status={
          runtime.handlers.includes(binding.handler) ? "available" : "missing"
        }
        title="Handler"
      >
        <label className="setta-workspace-inspector-config-row">
          <span className="setta-workspace-inspector-config-label">
            Function
          </span>
          <select
            aria-label="Handler function"
            className={`setta-workspace-inspector-config-input ${interactionClassName}`}
            onChange={(event) =>
              void actions.updateBinding(bindingId, {
                handler: event.currentTarget.value,
              })
            }
            value={binding.handler}
          >
            {runtime.handlers.includes(binding.handler) ? null : (
              <option value={binding.handler}>
                {binding.handler} (missing)
              </option>
            )}
            {runtime.handlers.map((handler) => (
              <option key={handler} value={handler}>
                {handler}
              </option>
            ))}
          </select>
        </label>
        <label className="realtime-handler-inspector-field">
          <span>Arguments</span>
          <textarea
            aria-label="Handler arguments"
            className={interactionClassName}
            onChange={(event) => setArgumentsDraft(event.currentTarget.value)}
            rows={7}
            value={argumentsDraft}
          />
        </label>
        <label className="realtime-handler-inspector-field">
          <span>Outputs</span>
          <input
            aria-label="Handler outputs"
            className={interactionClassName}
            onChange={(event) => setOutputDraft(event.currentTarget.value)}
            value={outputDraft}
          />
        </label>
        <button
          className={`setta-workspace-inspector-primary-action ${interactionClassName}`}
          onClick={() => void saveShape()}
          type="button"
        >
          Save inputs and outputs
        </button>
        {shapeFeedback === null ? null : <p role="status">{shapeFeedback}</p>}
      </WorkspaceInspectorSettingsGroup>
      <WorkspaceInspectorSettingsGroup title="Scheduling">
        <label className="setta-workspace-inspector-config-row">
          <span className="setta-workspace-inspector-config-label">Mode</span>
          <select
            aria-label="Scheduling mode"
            className={`setta-workspace-inspector-config-input ${interactionClassName}`}
            onChange={(event) =>
              void actions.updateBinding(bindingId, {
                scheduling: {
                  mode: event.currentTarget
                    .value as typeof binding.scheduling.mode,
                },
              })
            }
            value={binding.scheduling.mode}
          >
            <option value="once">Once</option>
            <option value="latest">Latest</option>
            <option value="parallel">Parallel</option>
          </select>
        </label>
        <label className="realtime-handler-inspector-field">
          <span>Concurrency group</span>
          <input
            aria-label="Concurrency group"
            className={interactionClassName}
            onChange={(event) =>
              setConcurrencyGroupDraft(event.currentTarget.value)
            }
            value={concurrencyGroupDraft}
          />
        </label>
        <label className="realtime-handler-inspector-field">
          <span>Debounce milliseconds</span>
          <input
            aria-label="Debounce milliseconds"
            className={interactionClassName}
            max={60_000}
            min={0}
            onChange={(event) => setDebounceDraft(event.currentTarget.value)}
            step={1}
            type="number"
            value={debounceDraft}
          />
        </label>
        <label className="realtime-handler-inspector-field">
          <span>Concurrency limit</span>
          <input
            aria-label="Concurrency limit"
            className={interactionClassName}
            max={64}
            min={1}
            onChange={(event) =>
              setConcurrencyLimitDraft(event.currentTarget.value)
            }
            step={1}
            type="number"
            value={concurrencyLimitDraft}
          />
        </label>
        <button
          className={`setta-workspace-inspector-primary-action ${interactionClassName}`}
          onClick={() => void saveScheduling()}
          type="button"
        >
          Save scheduling
        </button>
        {schedulingFeedback === null ? null : (
          <p role="status">{schedulingFeedback}</p>
        )}
      </WorkspaceInspectorSettingsGroup>
      <WorkspaceInspectorSettingsGroup title="Materialization">
        <label className="setta-workspace-inspector-checkbox">
          <input
            checked={binding.materialization !== undefined}
            onChange={(event) =>
              void actions.updateBinding(bindingId, {
                materialization: event.currentTarget.checked
                  ? { retention: "session", startup: "manual" }
                  : null,
              })
            }
            type="checkbox"
          />
          <span>Retain an output</span>
        </label>
        {binding.materialization === undefined ? null : (
          <>
            <label className="setta-workspace-inspector-config-row">
              <span className="setta-workspace-inspector-config-label">
                Retention
              </span>
              <select
                aria-label="Materialization retention"
                className={`setta-workspace-inspector-config-input ${interactionClassName}`}
                onChange={(event) =>
                  void actions.updateBinding(bindingId, {
                    materialization: {
                      retention: event.currentTarget.value as
                        "session" | "lastSuccessful",
                    },
                  })
                }
                value={binding.materialization.retention}
              >
                <option value="session">Session</option>
                <option value="lastSuccessful">Last successful</option>
              </select>
            </label>
            <label className="setta-workspace-inspector-config-row">
              <span className="setta-workspace-inspector-config-label">
                Startup
              </span>
              <select
                aria-label="Materialization startup"
                className={`setta-workspace-inspector-config-input ${interactionClassName}`}
                onChange={(event) =>
                  void actions.updateBinding(bindingId, {
                    materialization: {
                      startup: event.currentTarget
                        .value as typeof binding.materialization.startup,
                    },
                  })
                }
                value={binding.materialization.startup}
              >
                <option value="manual">Manual</option>
                {allowsAutomaticStartup ? (
                  <>
                    <option value="always">Always</option>
                    <option value="whenStale">When stale</option>
                    <option value="ifMissing">If missing</option>
                  </>
                ) : null}
              </select>
            </label>
          </>
        )}
      </WorkspaceInspectorSettingsGroup>
    </section>
  );
}
