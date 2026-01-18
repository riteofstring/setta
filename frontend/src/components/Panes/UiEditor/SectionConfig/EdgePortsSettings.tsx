import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { wrappedCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import _ from "lodash";
import { useEffect, useState, type DragEvent } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  getCurrShownParamIds,
  getParamDisplayName,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { C } from "utils/c";
import { res200 } from "utils/endpointUtils";
import {
  route_output_accessor_completion,
  route_set_section_edge_inputs,
  route_set_section_edge_outputs,
} from "utils/generatedEndpoints";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

type EdgePortsSettingsProps = {
  sectionId: string;
};

type EdgeOutputPort = {
  id: string;
  accessor: string;
};

export function EdgePortsSettings({ sectionId }: EdgePortsSettingsProps) {
  const { canEditStructure } = useShareCapabilities();
  const { edgeInputParams, edgeOutputPorts, paramLabels } = useProjectState(
    (state) => {
      const impl = getCurrEffectiveSectionImplWithTypeGuard(
        state,
        sectionId,
        isBaseSectionWithParamsImpl,
      );
      const pinned = getCurrShownParamIds(state, sectionId, true, true);
      const unpinned = getCurrShownParamIds(state, sectionId, false, true);
      const requiredParamIdsToPaths = {
        ...pinned.requiredParamIdsToPaths,
        ...unpinned.requiredParamIdsToPaths,
      };
      const paramLabels = Object.keys(requiredParamIdsToPaths).map(
        (paramId) => {
          const path = requiredParamIdsToPaths[paramId];
          const label = path
            ? paramNameFromPathArray(state, sectionId, path)
            : getParamDisplayName(state, sectionId, paramId);
          return { id: paramId, label };
        },
      );
      return {
        edgeInputParams: impl.edgeInputParams,
        edgeOutputPorts: impl.edgeOutputPorts,
        paramLabels,
      };
    },
    _.isEqual,
  );

  const [draftOutputPorts, setDraftOutputPorts] = useState<EdgeOutputPort[]>(
    [],
  );

  useEffect(() => {
    setDraftOutputPorts(toDraftOutputPorts(edgeOutputPorts));
  }, [edgeOutputPorts]);

  function onToggleInput(paramId: string) {
    if (!canEditStructure) {
      return;
    }
    const nextInputs = edgeInputParams.includes(paramId)
      ? edgeInputParams.filter((id) => id !== paramId)
      : [...edgeInputParams, paramId];
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          { edgeInputParams: nextInputs },
        );
      },
      send: (frontendOpId) =>
        route_set_section_edge_inputs({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          edgeInputParams: nextInputs,
          frontendOpId,
        }),
    });
  }

  function onOutputChange(portId: string, value: string) {
    setDraftOutputPorts((prev) =>
      prev.map((port) =>
        port.id === portId ? { ...port, accessor: value } : port,
      ),
    );
  }

  function removeOutputPort(portId: string) {
    const nextDraft = draftOutputPorts.filter((port) => port.id !== portId);
    setDraftOutputPorts(nextDraft);
    persistOutputPorts(nextDraft);
  }

  function onOutputBlur() {
    if (!canEditStructure) {
      return;
    }
    persistOutputPorts(draftOutputPorts);
  }

  function persistOutputPorts(ports: EdgeOutputPort[]) {
    const nextPorts = normalizeOutputPorts(ports);
    if (_.isEqual(nextPorts, edgeOutputPorts)) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          { edgeOutputPorts: nextPorts },
        );
      },
      send: (frontendOpId) =>
        route_set_section_edge_outputs({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          edgeOutputPorts: nextPorts,
          frontendOpId,
        }),
    });
    setDraftOutputPorts(toDraftOutputPorts(nextPorts));
  }

  function addOutputPort() {
    const nextDraft = [
      ...draftOutputPorts,
      {
        id: createNewId(),
        accessor: "",
      },
    ];
    setDraftOutputPorts(nextDraft);
  }

  const [draggedPortId, setDraggedPortId] = useState<string | null>(null);

  function onDragStart(event: DragEvent<HTMLSpanElement>, portId: string) {
    if (!canEditStructure) {
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", portId);
    setDraggedPortId(portId);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!canEditStructure) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function onDrop(event: DragEvent<HTMLDivElement>, portId: string) {
    if (!canEditStructure) {
      return;
    }
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === portId) {
      return;
    }
    const nextDraft = reorderOutputPorts(draftOutputPorts, sourceId, portId);
    setDraftOutputPorts(nextDraft);
    setDraggedPortId(null);
    persistOutputPorts(nextDraft);
  }

  function onDragEnd() {
    setDraggedPortId(null);
  }

  const completionsFn = wrappedCompletionsFn(
    async (fullText: string, position: number) => {
      const res = await route_output_accessor_completion({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        fullText,
        position,
      });
      if (res200(res)) {
        return res.data;
      }
      return [];
    },
  );
  const tooltipParentDivId = `edge-output-ports-${sectionId}`;

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 dark:border-setta-700/40 dark:bg-blue-950/30">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-600/70 dark:text-blue-300/60">
          Input Ports
        </h4>
        <div className="mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto text-xs">
          {paramLabels.map((param) => (
            <label
              key={param.id}
              className="flex items-center gap-2 text-slate-700 dark:text-slate-200"
            >
              <input
                type="checkbox"
                checked={edgeInputParams.includes(param.id)}
                onChange={() => onToggleInput(param.id)}
                disabled={!canEditStructure}
              />
              <span className="truncate">{param.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 dark:border-setta-700/40 dark:bg-blue-950/30">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-600/70 dark:text-blue-300/60">
          Output Ports
        </h4>
        <p className="mt-1 text-[0.7rem] text-blue-700/70 dark:text-blue-200/70">
          {`Use "." or "[" accessors. Enter "${C.EDGE_OUTPUT_BASE_LABEL}" for the base output.`}
        </p>
        <div className="mt-2 flex flex-col gap-2" id={tooltipParentDivId}>
          {draftOutputPorts.map((port) => (
            <div
              key={port.id}
              className={`flex items-center gap-2 ${
                draggedPortId === port.id ? "opacity-60" : ""
              }`}
              onDragOver={onDragOver}
              onDrop={(event) => onDrop(event, port.id)}
            >
              <span
                className="cursor-grab select-none text-xs text-blue-400/70"
                title="Drag to reorder"
                draggable={canEditStructure}
                onDragStart={(event) => onDragStart(event, port.id)}
                onDragEnd={onDragEnd}
              >
                :::
              </span>
              <div className="flex-1">
                <TextInputCodeMirror
                  sectionId={sectionId}
                  paramInfoId={port.id}
                  value={port.accessor}
                  defaultVal="."
                  onChange={(value: string) => onOutputChange(port.id, value)}
                  onBlur={onOutputBlur}
                  dummyCodeClassName="rounded-md border border-blue-200 bg-white/80 px-2 py-1 text-xs text-slate-700 dark:border-setta-700/60 dark:bg-setta-900/60 dark:text-slate-100"
                  realCodeClassName="rounded-md border border-blue-200 bg-white/80 px-2 py-1 text-xs text-slate-700 dark:border-setta-700/60 dark:bg-setta-900/60 dark:text-slate-100"
                  singleLine={true}
                  color="blue"
                  language="python"
                  autocomplete={canEditStructure}
                  tooltipParentDivId={tooltipParentDivId}
                  completionsFn={completionsFn}
                />
              </div>
              <button
                type="button"
                className="rounded px-2 py-1 text-[0.65rem] font-semibold text-blue-700/70 hover:text-blue-900 dark:text-blue-200/70 dark:hover:text-blue-100"
                onClick={() => removeOutputPort(port.id)}
                disabled={!canEditStructure}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="self-start rounded border border-blue-200 bg-white/80 px-2 py-1 text-[0.7rem] font-semibold text-blue-700/80 hover:bg-blue-50 dark:border-setta-700/60 dark:bg-setta-900/60 dark:text-blue-200/80 dark:hover:bg-setta-800/60"
            onClick={addOutputPort}
            disabled={!canEditStructure}
          >
            Add output
          </button>
        </div>
      </div>
    </section>
  );
}

function toDraftOutputPorts(ports: EdgeOutputPort[]) {
  return ports.map((port) => ({
    id: port.id,
    accessor:
      port.accessor.trim() === "" ? C.EDGE_OUTPUT_BASE_LABEL : port.accessor,
  }));
}

function normalizeAccessor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === C.EDGE_OUTPUT_BASE_LABEL) {
    return "";
  }
  return trimmed;
}

function normalizeOutputPorts(ports: EdgeOutputPort[]) {
  const normalized: EdgeOutputPort[] = [];
  for (const port of ports) {
    const accessor = normalizeAccessor(port.accessor);
    if (accessor === null) {
      continue;
    }
    normalized.push({
      id: port.id,
      accessor,
    });
  }
  return normalized;
}

function reorderOutputPorts(
  ports: EdgeOutputPort[],
  sourceId: string,
  targetId: string,
) {
  const sourceIndex = ports.findIndex((port) => port.id === sourceId);
  const targetIndex = ports.findIndex((port) => port.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return ports;
  }
  const next = [...ports];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}
