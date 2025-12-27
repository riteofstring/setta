import { MetaControlContent } from "components/Section/Layouts/MetaControl/MetaControlNode";
import _ from "lodash";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  getSectionCore,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import {
  sendRealtimeControlAction,
  sendRealtimeSectionParamLiteral,
} from "state/actions/websocketReceive";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import {
  ActionControlType,
  CodeObjType,
  SectionTypeEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";

function _MetaControlArea({ sectionId }: { sectionId: string }) {
  const { controlParamId, actionControlType, sectionName } = useProjectState(
    (x) => {
      const impl = getCurrEffectiveSectionImplOfType(
        x,
        sectionId,
        SectionTypeEnum.MetaControl,
      );
      return {
        controlParamId: impl.controlParamId,
        actionControlType: impl.actionControlType,
        sectionName: getSectionCore(x, sectionId).name,
      };
    },
  );

  if (actionControlType) {
    return (
      <MetaControlActionArea
        sectionName={sectionName}
        actionControlType={actionControlType}
      />
    );
  }

  if (!controlParamId) {
    return null;
  }

  return (
    <MetaControlValueArea
      sectionId={sectionId}
      controlParamId={controlParamId}
    />
  );
}

function MetaControlValueArea({
  sectionId,
  controlParamId,
}: {
  sectionId: string;
  controlParamId: string;
}) {
  const { codeObjType, baseValue, defaultVal } = useProjectState((x) => {
    const impl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      controlParamId,
      isBaseChildlessCodeObjImpl,
    );
    return {
      codeObjType: impl.type,
      baseValue: impl.value,
      defaultVal: impl.defaultVal,
    };
  }, _.isEqual);

  const [value, setPendingValue] = useLocalPendingValue(
    baseValue,
    (pendingValue) => {
      useProjectState.setState((state) => {
        setCurrEffectiveCodeObjImplValue<"BaseChildlessCodeObj">(
          state,
          sectionId,
          controlParamId,
          {
            value: pendingValue,
          },
        );
      });
    },
  );

  function handleValueChange(nextValue: string) {
    const valueStr = _.toString(nextValue);
    setPendingValue(valueStr);
    if (value !== valueStr) {
      sendRealtimeSectionParamLiteral(sectionId, controlParamId, valueStr);
    }
    debouncedSetParamEnteredValue(sectionId, controlParamId, valueStr);
  }

  return (
    <div className="col-span-full row-span-full flex h-full w-full items-stretch p-0">
      <MetaControlContent
        sectionId={sectionId}
        controlParamId={controlParamId}
        codeObjType={codeObjType as CodeObjType}
        value={value}
        defaultVal={defaultVal}
        onValueChange={handleValueChange}
      />
    </div>
  );
}

function MetaControlActionArea({
  sectionName,
  actionControlType,
}: {
  sectionName: string;
  actionControlType: ActionControlType;
}) {
  function handleAction() {
    sendRealtimeControlAction({
      controlName: sectionName,
      actionId: sectionName,
      actionControlType,
      payload: null,
    });
  }

  return (
    <div className="col-span-full row-span-full flex h-full w-full items-center justify-center p-0">
      <button
        type="button"
        className="flex h-8 min-w-[120px] items-center justify-center rounded-lg bg-setta-200/30 px-3 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-300 dark:hover:bg-setta-900"
        onClick={handleAction}
      >
        Trigger
      </button>
    </div>
  );
}

export const MetaControlArea = React.memo(_MetaControlArea);

const debouncedSetParamEnteredValue = _.debounce(
  (sectionId: string, paramInfoId: string, value: string) => {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"BaseChildlessCodeObj">(
          state,
          sectionId,
          paramInfoId,
          {
            value,
          },
        );
      },
      send: (frontendOpId) =>
        route_set_param_entered_value({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          value,
          frontendOpId,
        }),
    });
  },
  50,
);
