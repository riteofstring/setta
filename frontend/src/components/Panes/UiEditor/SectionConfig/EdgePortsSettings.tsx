import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { wrappedCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import _ from "lodash";
import {
  outputAccessorCompletion,
  setSectionEdgeInputs,
  setSectionEdgeOutputs,
  setVariantJsonSourceKeys,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  getCurrShownParamIds,
  getParamDisplayNameIfPresent,
  getVariantBaseAndEffectiveSectionImpl,
  setCurrEffectiveSectionImplValue,
  setSectionVariantImplValue,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import {
  usePendingOperations,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { C } from "utils/c";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { shallow } from "zustand/shallow";
type EdgePortsSettingsProps = {
  sectionId: string;
};
type EdgeOutputPort = {
  id: string;
  accessor: string;
};
type JsonSourcePathSetter = (value: string) => void;
type JsonSourceErrorSetter = (value: string | null) => void;
type JsonSourcePathUpdateResponse = ResponseDataAndStatus<unknown>;
type JsonSourcePathFailureArgs = {
  frontendOpId: string;
  sectionId: string;
  targetVariantId: string;
  nextKeys: string[];
  previousKeys: string[];
  previousPath: string;
  response: JsonSourcePathUpdateResponse;
  setJsonSourcePath: JsonSourcePathSetter;
  setJsonSourceError: JsonSourceErrorSetter;
};
type JsonSourcePathUpdateArgs = {
  frontendOpId: string;
  projectConfigId: string;
  sectionId: string;
  targetVariantId: string;
  nextKeys: string[];
  previousKeys: string[];
  previousPath: string;
  setJsonSourcePath: JsonSourcePathSetter;
  setJsonSourceError: JsonSourceErrorSetter;
};

function formatJsonSourcePath(keys: string[]) {
  return keys.join(".");
}
function parseJsonSourcePath(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") {
    return [];
  }
  return trimmed
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}
function shouldRollbackJsonSourceKeys(
  sectionId: string,
  variantId: string,
  expectedKeys: string[],
): boolean {
  const state = useProjectState.getState();
  const core = state.sections[sectionId];
  if (!core || !state.sectionVariants[variantId]) {
    return false;
  }
  if (!core.variants.includes(variantId)) {
    return false;
  }
  const { impl } = getVariantBaseAndEffectiveSectionImpl(
    state,
    core,
    variantId,
  );
  if (impl.type !== SectionTypeEnum.Dict) {
    return false;
  }
  const dictImpl = impl as { jsonSourceKeys: string[] | null };
  return _.isEqual(dictImpl.jsonSourceKeys ?? [], expectedKeys);
}
function buildParamLabels(
  state: ZustandProjectState,
  sectionId: string,
  pinnedRequiredParamIdsToPaths: Record<string, Array<string>>,
  unpinnedRequiredParamIdsToPaths: Record<string, Array<string>>,
) {
  const requiredParamIdsToPaths = {
    ...pinnedRequiredParamIdsToPaths,
    ...unpinnedRequiredParamIdsToPaths,
  };
  return Object.keys(requiredParamIdsToPaths).map((paramId) => {
    const path = requiredParamIdsToPaths[paramId];
    const label = path
      ? paramNameFromPathArray(state, sectionId, path)
      : getParamDisplayNameIfPresent(state, sectionId, paramId) ?? paramId;
    return { id: paramId, label };
  });
}

function clearPendingOperation(frontendOpId: string) {
  usePendingOperations.setState((state) => ({
    pending: state.pending.filter((op) => op.opId !== frontendOpId),
  }));
}

function resolveJsonSourcePathErrorMessage(
  response: JsonSourcePathUpdateResponse,
): string {
  if (!response.hasResponse) {
    return "Could not reach the backend.";
  }
  if (response.status === 400) {
    return getErrorDetail(response.data) ?? "Invalid JSON source path.";
  }
  if (response.status === 403) {
    return getErrorDetail(response.data) ?? "JSON source keys are read-only.";
  }
  return "Failed to update JSON source path.";
}

function rollbackJsonSourceKeysUpdate({
  sectionId,
  targetVariantId,
  previousKeys,
  previousPath,
  response,
  setJsonSourcePath,
  setJsonSourceError,
}: Omit<JsonSourcePathFailureArgs, "frontendOpId" | "nextKeys">) {
  useProjectState.setState((state) => {
    setSectionVariantImplValue<BaseSectionImplUnion>(
      state,
      sectionId,
      targetVariantId,
      {
        jsonSourceKeys: previousKeys,
      },
    );
  });
  if (
    getCurrSectionVariantId(useProjectState.getState(), sectionId) !==
    targetVariantId
  ) {
    return;
  }
  setJsonSourcePath(previousPath);
  setJsonSourceError(resolveJsonSourcePathErrorMessage(response));
}

function handleJsonSourcePathUpdateFailure({
  frontendOpId,
  sectionId,
  targetVariantId,
  nextKeys,
  previousKeys,
  previousPath,
  response,
  setJsonSourcePath,
  setJsonSourceError,
}: JsonSourcePathFailureArgs) {
  clearPendingOperation(frontendOpId);
  if (!shouldRollbackJsonSourceKeys(sectionId, targetVariantId, nextKeys)) {
    return;
  }
  rollbackJsonSourceKeysUpdate({
    sectionId,
    targetVariantId,
    previousKeys,
    previousPath,
    response,
    setJsonSourcePath,
    setJsonSourceError,
  });
}

async function sendJsonSourcePathUpdate({
  frontendOpId,
  projectConfigId,
  sectionId,
  targetVariantId,
  nextKeys,
  previousKeys,
  previousPath,
  setJsonSourcePath,
  setJsonSourceError,
}: JsonSourcePathUpdateArgs): Promise<JsonSourcePathUpdateResponse> {
  const response = await callOpenAPI(
    setVariantJsonSourceKeys({
      body: {
        projectConfigId,
        sectionId,
        variantId: targetVariantId,
        jsonSourceKeys: nextKeys,
        frontendOpId,
      },
    } as Parameters<typeof setVariantJsonSourceKeys>[0]),
  );
  if (!res200(response)) {
    handleJsonSourcePathUpdateFailure({
      frontendOpId,
      sectionId,
      targetVariantId,
      nextKeys,
      previousKeys,
      previousPath,
      response,
      setJsonSourcePath,
      setJsonSourceError,
    });
    return response;
  }
  if (
    getCurrSectionVariantId(useProjectState.getState(), sectionId) ===
    targetVariantId
  ) {
    setJsonSourceError(null);
  }
  return response;
}

export function EdgePortsSettings({ sectionId }: EdgePortsSettingsProps) {
  const { canEditStructure, canEditVariants } = useShareCapabilities();
  const projectConfigId = getCurrProjectConfigId();
  const { edgeInputParams, edgeOutputPorts, jsonSourceKeys, isJsonSource } =
    useProjectState((state) => {
      const impl = getCurrEffectiveSectionImplWithTypeGuard(
        state,
        sectionId,
        isBaseSectionWithParamsImpl,
      );
      const dictImpl =
        impl.type === SectionTypeEnum.Dict
          ? (impl as {
              isJsonSource: boolean;
              jsonSourceKeys: string[] | null;
            })
          : null;
      return {
        edgeInputParams: impl.edgeInputParams,
        edgeOutputPorts: impl.edgeOutputPorts,
        jsonSourceKeys: dictImpl?.jsonSourceKeys ?? [],
        isJsonSource: dictImpl?.isJsonSource ?? false,
      };
    }, shallow);
  const variantId = useProjectState((state) =>
    getCurrSectionVariantId(state, sectionId),
  );
  const allowJsonSourceKeyEdits = useProjectState(
    (state) => state.projectConfig.allowJsonSourceKeyEdits,
  );
  const {
    showParamDisplayNames,
    projectSectionVariantMap,
    sections,
    sectionVariants,
    sectionImpls,
    codeObjs,
    codeObjVariants,
    codeObjImpls,
    pinnedRequiredParamIdsToPaths,
    unpinnedRequiredParamIdsToPaths,
  } = useProjectState((state) => {
    const pinned = getCurrShownParamIds(state, sectionId, true, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false, true);
    return {
      showParamDisplayNames: state.projectConfig.showParamDisplayNames,
      projectSectionVariantMap: state.projectConfig.sectionVariantMap,
      sections: state.sections,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      codeObjs: state.codeObjs,
      codeObjVariants: state.codeObjVariants,
      codeObjImpls: state.codeObjImpls,
      pinnedRequiredParamIdsToPaths: pinned.requiredParamIdsToPaths,
      unpinnedRequiredParamIdsToPaths: unpinned.requiredParamIdsToPaths,
    };
  }, shallow);
  const paramLabels = useMemo(() => {
    return buildParamLabels(
      useProjectState.getState(),
      sectionId,
      pinnedRequiredParamIdsToPaths,
      unpinnedRequiredParamIdsToPaths,
    );
  }, [
    codeObjImpls,
    codeObjVariants,
    codeObjs,
    pinnedRequiredParamIdsToPaths,
    projectSectionVariantMap,
    sectionId,
    sectionImpls,
    sections,
    sectionVariants,
    showParamDisplayNames,
    unpinnedRequiredParamIdsToPaths,
  ]);
  const canEditJsonSourceKeys = canEditVariants && allowJsonSourceKeyEdits;
  const [jsonSourcePath, setJsonSourcePath] = useState("");
  const [jsonSourceError, setJsonSourceError] = useState<string | null>(null);
  const [draftOutputPorts, setDraftOutputPorts] = useState<EdgeOutputPort[]>(
    [],
  );
  useEffect(() => {
    setDraftOutputPorts(toDraftOutputPorts(edgeOutputPorts));
  }, [edgeOutputPorts]);
  useEffect(() => {
    setJsonSourcePath(formatJsonSourcePath(jsonSourceKeys));
  }, [jsonSourceKeys, variantId]);
  useEffect(() => {
    setJsonSourceError(null);
  }, [variantId]);
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
        callOpenAPI(
          setSectionEdgeInputs({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              edgeInputParams: nextInputs,
              frontendOpId,
            },
          } as Parameters<typeof setSectionEdgeInputs>[0]),
        ),
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
        callOpenAPI(
          setSectionEdgeOutputs({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              edgeOutputPorts: nextPorts,
              frontendOpId,
            },
          } as Parameters<typeof setSectionEdgeOutputs>[0]),
        ),
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
  function onJsonSourcePathBlur() {
    if (!canEditJsonSourceKeys) {
      return;
    }
    const nextKeys = parseJsonSourcePath(jsonSourcePath);
    if (_.isEqual(nextKeys, jsonSourceKeys)) {
      return;
    }
    const previousKeys = [...jsonSourceKeys];
    const previousPath = formatJsonSourcePath(previousKeys);
    const targetVariantId = variantId;
    setJsonSourcePath(formatJsonSourcePath(nextKeys));
    const opId = dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setSectionVariantImplValue<BaseSectionImplUnion>(
          state,
          sectionId,
          targetVariantId,
          {
            jsonSourceKeys: nextKeys,
          },
        );
      },
      send: (frontendOpId) =>
        sendJsonSourcePathUpdate({
          frontendOpId,
          projectConfigId,
          sectionId,
          targetVariantId,
          nextKeys,
          previousKeys,
          previousPath,
          setJsonSourcePath,
          setJsonSourceError,
        }),
    });
    return opId;
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
  const completionsFn = useMemo(
    () =>
      wrappedCompletionsFn(async (fullText: string, position: number) => {
        const res = await callOpenAPI(
          outputAccessorCompletion({
            body: {
              projectConfigId,
              sectionId,
              fullText,
              position,
            },
          } as Parameters<typeof outputAccessorCompletion>[0]),
        );
        if (res200(res)) {
          return res.data;
        }
        return [];
      }),
    [projectConfigId, sectionId],
  );
  const tooltipParentDivId = `edge-output-ports-${sectionId}`;
  const edgeInputParamIdSet = useMemo(
    () => new Set(edgeInputParams),
    [edgeInputParams],
  );
  return (
    <section className="flex flex-col gap-4">
      {isJsonSource && (
        <div className="rounded-md border border-orange-100 bg-orange-50/60 p-3 dark:border-setta-700/40 dark:bg-orange-950/30">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-600/70 dark:text-orange-300/70">
            JSON Source Path
          </h4>
          <p className="mt-1 text-[0.7rem] text-orange-700/70 dark:text-orange-200/70">
            Dot-separated keys. Leave empty for the root.
          </p>
          <input
            className="mt-2 w-full rounded-md border border-orange-200 bg-white/80 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-setta-700/60 dark:bg-setta-900/60 dark:text-slate-100 dark:focus:ring-orange-600"
            value={jsonSourcePath}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setJsonSourcePath(event.target.value);
              if (jsonSourceError) {
                setJsonSourceError(null);
              }
            }}
            onBlur={onJsonSourcePathBlur}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            placeholder="e.g. settings.paths.app"
            disabled={!canEditJsonSourceKeys}
          />
          {jsonSourceError && (
            <p className="mt-2 text-[0.7rem] text-red-600 dark:text-red-300">
              {jsonSourceError}
            </p>
          )}
        </div>
      )}
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
                checked={edgeInputParamIdSet.has(param.id)}
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
              className={`flex items-center gap-2 ${draggedPortId === port.id ? "opacity-60" : ""}`}
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
