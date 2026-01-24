import _ from "lodash";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionParamLiteral,
} from "state/actions/websocketReceive";
import { useProjectState, useToolArgumentPreview } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import {
  DependencyKeyTypeEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import { ParamUI } from "../ParamUIs/ParamUI";

function _ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const baseValue = useProjectState((x) => {
    const impl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
      true, // preview
    );
    return impl.value;
  });
  const previewValue = useToolArgumentPreview((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return null;
    }
    const sectionEntries =
      previewState.previewParamValueBySectionAndParamId[sectionId];
    if (!sectionEntries) {
      return null;
    }
    const entry = sectionEntries[paramInfoId];
    return entry ? entry.value : null;
  });
  const globalValue = previewValue ?? baseValue;

  const [value, setPendingValue] = useLocalPendingValue(
    globalValue,
    (pendingValue) => {
      useProjectState.setState((state) => {
        setCurrEffectiveCodeObjImplValue<"BaseChildlessCodeObj">(
          state,
          sectionId,
          paramInfoId,
          {
            value: pendingValue,
          },
        );
      });
    },
  );

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setPendingValue(vStr);
    if (value !== vStr) {
      sendRealtimeSectionParamLiteral(sectionId, paramInfoId, vStr);
    }
    debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr);
  }

  function onDropzoneStateless(attachments: DropzoneStatelessAttachment[]) {
    if (attachments.length === 0) {
      return;
    }
    sendRealtimeDependencyEvent({
      dependencyKey: {
        type: DependencyKeyTypeEnum.SectionParam,
        sectionId,
        codeObjId: paramInfoId,
      },
      payload: JSON.stringify({
        sectionId,
        paramInfoId,
        attachments,
      }),
    });
  }

  return (
    <ParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onDropzoneStateless={onDropzoneStateless}
      maybeErrorMessage={maybeErrorMessage}
    />
  );
}

const debouncedSetParamEnteredValue = _.debounce(
  (sectionId, paramInfoId, value) => {
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

export const ParamInput = React.memo(_ParamInput);
