import { MetaControlContent } from "components/Section/Layouts/MetaControl/MetaControlNode";
import _ from "lodash";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  getSectionCore,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  sendRealtimeMetaControlAction,
  sendRealtimeMetaControlLiteral,
} from "state/actions/websocketReceive";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import { route_set_meta_control_value } from "utils/generatedEndpoints";
import { MetaControlTypeEnum, SectionTypeEnum } from "utils/generatedTypes";

function _MetaControlArea({ sectionId }: { sectionId: string }) {
  const metaControlType = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.MetaControl,
    );
    return impl.metaControlType;
  });
  const baseValue = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.MetaControl,
    );
    return impl.metaControlValue;
  });
  const sectionName = useProjectState((x) => getSectionCore(x, sectionId).name);

  const [value, setPendingValue] = useLocalPendingValue(
    baseValue,
    (pendingValue) => {
      useProjectState.setState((state) => {
        setCurrEffectiveSectionImplValue<"MetaControlSection">(
          state,
          sectionId,
          {
            metaControlValue: pendingValue,
          },
        );
      });
    },
  );

  function handleMetaControlValueChange(nextValue: string) {
    const valueStr = _.toString(nextValue);
    if (metaControlType === MetaControlTypeEnum.button) {
      sendRealtimeMetaControlAction({
        controlName: sectionName,
        actionId: sectionName,
        metaControlType,
        payload: valueStr,
      });
      return;
    }
    setPendingValue(valueStr);
    if (value !== valueStr) {
      sendRealtimeMetaControlLiteral(sectionId, valueStr);
    }
    debouncedSetMetaControlValue(sectionId, valueStr);
  }

  return (
    <div className="col-span-full row-span-full flex h-full w-full items-stretch p-0">
      <MetaControlContent
        metaControlType={metaControlType}
        metaControlValue={value}
        onMetaControlValueChange={handleMetaControlValueChange}
      />
    </div>
  );
}

export const MetaControlArea = React.memo(_MetaControlArea);

const debouncedSetMetaControlValue = _.debounce(
  (sectionId: string, value: string) => {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"MetaControlSection">(
          state,
          sectionId,
          {
            metaControlValue: value,
          },
        );
      },
      send: (frontendOpId) =>
        route_set_meta_control_value({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          value,
          frontendOpId,
        }),
    });
  },
  50,
);
