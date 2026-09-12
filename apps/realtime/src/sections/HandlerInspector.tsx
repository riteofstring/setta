import { useEffect, useState } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
} from "@setta/workspace";

import { realtimeAutomaticStartupSource } from "../app/realtimeGraph";
import { useRealtime } from "../app/runtimeContext";
import type { JsonValue } from "../backend/generatedContract";
import { readHandlerSectionData } from "./sectionData";

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

export function HandlerInspector({ data }: { data: unknown }) {
  const { actions, project, runtime } = useRealtime();
  const { bindingId } = readHandlerSectionData(data);
  const binding = project.bindings.find(
    (candidate) => candidate.id === bindingId,
  );
  const [argumentsDraft, setArgumentsDraft] = useState("");
  const [outputDraft, setOutputDraft] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    if (binding !== undefined) {
      setArgumentsDraft(JSON.stringify(binding.arguments, null, 2));
      setOutputDraft(Object.keys(binding.outputs).sort().join(", "));
      setFeedback(null);
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
    const outputNames = [
      ...new Set(
        outputDraft
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    ];
    if (argumentsValue === null) {
      setFeedback("Arguments must be a JSON object.");
      return;
    }
    const saved = await actions.updateBinding(bindingId, {
      arguments: argumentsValue,
      outputNames,
    });
    setFeedback(
      saved ? "Binding shape saved." : "Binding shape was not saved.",
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
        {feedback === null ? null : <p role="status">{feedback}</p>}
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
              void actions.updateBinding(bindingId, {
                scheduling: {
                  concurrencyGroup: event.currentTarget.value,
                },
              })
            }
            value={binding.scheduling.concurrencyGroup}
          />
        </label>
        <label className="realtime-handler-inspector-field">
          <span>Debounce milliseconds</span>
          <input
            aria-label="Debounce milliseconds"
            className={interactionClassName}
            min={0}
            onChange={(event) =>
              void actions.updateBinding(bindingId, {
                scheduling: {
                  debounceMilliseconds: Number(event.currentTarget.value),
                },
              })
            }
            type="number"
            value={binding.scheduling.debounceMilliseconds}
          />
        </label>
        <label className="realtime-handler-inspector-field">
          <span>Concurrency limit</span>
          <input
            aria-label="Concurrency limit"
            className={interactionClassName}
            min={1}
            onChange={(event) =>
              void actions.updateBinding(bindingId, {
                scheduling: {
                  concurrencyLimit: Number(event.currentTarget.value),
                },
              })
            }
            type="number"
            value={binding.scheduling.concurrencyLimit}
          />
        </label>
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
