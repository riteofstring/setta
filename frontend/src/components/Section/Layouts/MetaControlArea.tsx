import type { ParamValueChange } from "components/Params/ParamUIs/ConfiguredParamInputs";
import { MetaControlContent } from "components/Section/Layouts/MetaControl/MetaControlNode";
import _ from "lodash";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  getSectionCore,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import {
  sendRealtimeControlAction,
  sendRealtimeSectionLiteral,
} from "state/actions/websocketReceive";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";

function _MetaControlArea({ sectionId }: { sectionId: string }) {
  const { controlParamId } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.MetaControl,
    );
    return {
      controlParamId: impl.metaControlParamId,
    };
  }, _.isEqual);

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
  const { codeObjType, baseValue, defaultVal, sectionName } = useProjectState(
    (x) => {
      const sectionName = getSectionCore(x, sectionId).name;
      const controlImpl = getCurrEffectiveCodeObjImpl(
        x,
        sectionId,
        controlParamId,
      );
      if (controlImpl.type === CodeObjTypeEnum.ButtonParam) {
        return {
          codeObjType: controlImpl.type,
          baseValue: "",
          defaultVal: "",
          sectionName,
        };
      }
      const childlessImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
        x,
        sectionId,
        controlParamId,
        isBaseChildlessCodeObjImpl,
      );
      return {
        codeObjType: childlessImpl.type,
        baseValue: childlessImpl.value,
        defaultVal: childlessImpl.defaultVal,
        sectionName,
      };
    },
    _.isEqual,
  );

  const [value, setPendingValue] = useLocalPendingValue(
    baseValue,
    (pendingValue) => {
      if (codeObjType === CodeObjTypeEnum.ButtonParam) {
        return;
      }
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

  const handleValueChange: ParamValueChange = (nextValue) => {
    if (codeObjType === CodeObjTypeEnum.ButtonParam) {
      return;
    }
    if (nextValue === null) {
      return;
    }
    const valueStr = _.toString(nextValue);
    setPendingValue(valueStr);
    if (value !== valueStr) {
      sendRealtimeSectionLiteral(sectionId, valueStr);
    }
    debouncedSetParamEnteredValue(sectionId, controlParamId, valueStr);
  };

  function handleAction() {
    sendRealtimeControlAction({
      controlName: sectionName,
      actionId: sectionName,
      actionControlType: CodeObjTypeEnum.ButtonParam,
      payload: null,
    });
  }

  return (
    <div className="col-span-full row-span-full flex h-full w-full items-stretch p-0">
      {codeObjType === CodeObjTypeEnum.ButtonParam ? (
        <MetaControlContent
          sectionId={sectionId}
          controlParamId={controlParamId}
          codeObjType={codeObjType}
          onAction={handleAction}
        />
      ) : (
        <MetaControlContent
          sectionId={sectionId}
          controlParamId={controlParamId}
          codeObjType={codeObjType}
          value={value}
          defaultVal={defaultVal}
          onValueChange={handleValueChange}
        />
      )}
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
