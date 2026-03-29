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
import { res200 } from "utils/endpointUtils";
import {
  route_get_password_param_value,
  route_set_param_entered_value,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import type { ParamValueChangeOptions } from "../ParamUIs/ConfiguredParamInputs";
import { ParamUI } from "../ParamUIs/ParamUI";
import {
  buildDropzoneDependencyEvents,
  planParamInputChange,
  shouldRevealPasswordValue,
} from "../paramInputView";

type ParamInputProps = {
  sectionId: string;
  paramInfoId: string;
  maybeErrorMessage?: string;
  onAutoActivatedCodeMirrorReady?: () => void;
};

type ParamInputState = {
  projectConfigId: string;
  baseValue: string;
  codeObjType: CodeObjTypeEnum;
};

function _ParamInput({
  sectionId,
  paramInfoId,
  maybeErrorMessage,
  onAutoActivatedCodeMirrorReady,
}: ParamInputProps) {
  const { projectConfigId, baseValue, codeObjType } = useProjectState(
    (x): ParamInputState => {
      const impl = getCurrEffectiveCodeObjImplWithTypeGuard(
        x,
        sectionId,
        paramInfoId,
        isBaseChildlessCodeObjImpl,
        true, // preview
      );
      return {
        projectConfigId: x.projectConfig.id,
        baseValue: impl.value,
        codeObjType: impl.type,
      };
    },
    _.isEqual,
  );
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
      if (codeObjType === CodeObjTypeEnum.PasswordParam) {
        return;
      }
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
  const [isRevealing, setIsRevealing] = React.useState(false);

  // value and enteredValue should always be string
  function onChange(
    nextValue: string | number | boolean | null,
    options?: ParamValueChangeOptions,
  ) {
    const changePlan = planParamInputChange({
      previousValue: value,
      nextValue,
      codeObjType,
      options,
    });

    setPendingValue(changePlan.nextValue);
    if (changePlan.shouldEmitRealtime) {
      sendRealtimeSectionParamLiteral(
        sectionId,
        paramInfoId,
        changePlan.nextValue,
      );
    }

    if (changePlan.backendUpdateKind === "password") {
      debouncedSetPasswordParamValue(
        sectionId,
        paramInfoId,
        changePlan.nextValue,
      );
      return;
    }

    if (changePlan.backendUpdateKind === "standard") {
      debouncedSetParamEnteredValue(
        sectionId,
        paramInfoId,
        changePlan.nextValue,
      );
    }
  }

  function onRevealPassword() {
    if (
      !shouldRevealPasswordValue({
        codeObjType,
        isRevealing,
        value,
      })
    ) {
      return;
    }
    setIsRevealing(true);
    route_get_password_param_value({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
    })
      .then((response) => {
        if (res200(response)) {
          setPendingValue(response.data.value);
        }
      })
      .finally(() => {
        setIsRevealing(false);
      });
  }

  function onDropzoneStateless(attachments: DropzoneStatelessAttachment[]) {
    for (const event of buildDropzoneDependencyEvents({
      sectionId,
      paramInfoId,
      attachments,
    })) {
      sendRealtimeDependencyEvent(event);
    }
  }

  return (
    <ParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onDropzoneStateless={onDropzoneStateless}
      onRevealPassword={onRevealPassword}
      isPasswordRevealPending={isRevealing}
      maybeErrorMessage={maybeErrorMessage}
      onAutoActivatedCodeMirrorReady={onAutoActivatedCodeMirrorReady}
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

const debouncedSetPasswordParamValue = _.debounce(
  (sectionId, paramInfoId, value) => {
    route_set_param_entered_value({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
      value,
    });
  },
  50,
);

export const ParamInput = React.memo(_ParamInput);
