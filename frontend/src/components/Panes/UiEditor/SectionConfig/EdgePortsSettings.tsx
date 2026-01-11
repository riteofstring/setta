import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { wrappedCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import _ from "lodash";
import { useEffect, useState } from "react";
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
import { res200 } from "utils/endpointUtils";
import {
  route_output_accessor_completion,
  route_set_section_edge_inputs,
  route_set_section_edge_outputs,
} from "utils/generatedEndpoints";
import {
  isBaseSectionWithParamsImpl,
  PortSide,
  PortSideEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

type EdgePortsSettingsProps = {
  sectionId: string;
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

  const outputText = edgeOutputPorts
    .map((port) => (port.accessor.trim() === "" ? "value" : port.accessor))
    .join("\n");
  const [draftOutput, setDraftOutput] = useState(outputText);

  useEffect(() => {
    setDraftOutput(outputText);
  }, [outputText]);

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

  function onOutputChange(value: string) {
    setDraftOutput(value);
  }

  function onOutputBlur() {
    if (!canEditStructure) {
      return;
    }
    const nextPorts = buildEdgeOutputPorts(draftOutput, edgeOutputPorts);
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
          One accessor per line. Use "value" for the base output.
        </p>
        <div className="mt-2">
          <TextInputCodeMirror
            sectionId={sectionId}
            paramInfoId={null}
            value={draftOutput}
            defaultVal="."
            onChange={onOutputChange}
            onBlur={onOutputBlur}
            dummyCodeClassName="rounded-md border border-blue-200 bg-white/80 px-2 py-1 text-xs text-slate-700 dark:border-setta-700/60 dark:bg-setta-900/60 dark:text-slate-100"
            realCodeClassName="rounded-md border border-blue-200 bg-white/80 px-2 py-1 text-xs text-slate-700 dark:border-setta-700/60 dark:bg-setta-900/60 dark:text-slate-100"
            singleLine={false}
            color="blue"
            language="python"
            autocomplete={canEditStructure}
            completionsFn={completionsFn}
          />
        </div>
      </div>
    </section>
  );
}

function buildEdgeOutputPorts(
  outputText: string,
  existingPorts: Array<{ id: string; accessor: string; side: PortSide | null }>,
) {
  const lines = outputText.split("\n");
  const accessors = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line === "value" ? "" : line));

  return accessors.map((accessor, idx) => {
    const existing = existingPorts[idx];
    return {
      id: existing?.id ?? createNewId(),
      accessor,
      side: existing?.side ?? PortSideEnum.Right,
    };
  });
}
