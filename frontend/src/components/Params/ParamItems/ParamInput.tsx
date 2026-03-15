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
} from "state/actions/websocketRealtimeDispatch";
import { useProjectState, useToolArgumentPreview } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import { res200 } from "utils/endpointUtils";
import {
  route_get_password_param_value,
  route_set_param_entered_value,
} from "utils/generatedEndpoints";
import {
  BinaryDependencyValue,
  CodeObjTypeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  LiteralDependencyValue,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import { shouldEmitRealtimeValue } from "utils/paramValue";
import type { ParamValueChangeOptions } from "../ParamUIs/ConfiguredParamInputs";
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
  const codeObjType = useProjectState((x) => {
    const impl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
      true, // preview
    );
    return impl.type;
  });
  const isPasswordParam = codeObjType === CodeObjTypeEnum.PasswordParam;
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
      if (isPasswordParam) {
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
  function onChange(v, options?: ParamValueChangeOptions) {
    const vStr = _.toString(v);
    setPendingValue(vStr);
    if (
      shouldEmitRealtimeValue({
        previousValue: value,
        nextValue: vStr,
        codeObjType,
      })
    ) {
      sendRealtimeSectionParamLiteral(sectionId, paramInfoId, vStr);
    }
    if (!options?.skipBackendUpdate) {
      if (isPasswordParam) {
        debouncedSetPasswordParamValue(sectionId, paramInfoId, vStr);
      } else {
        debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr);
      }
    }
  }

  function onRevealPassword() {
    if (!isPasswordParam || isRevealing || value !== "") {
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
    if (attachments.length === 0) {
      return;
    }
    const dependencyKey = {
      type: DependencyKeyTypeEnum.SectionParam,
      sectionId,
      codeObjId: paramInfoId,
    };
    const metadataAttachments = attachments.map((attachment) => {
      if (attachment.kind === "file") {
        return {
          kind: attachment.kind,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          contentId: attachment.contentId,
          byteLength: attachment.byteLength,
        };
      }
      return attachment;
    });
    const metadataPayload: LiteralDependencyValue = {
      payload: JSON.stringify({
        sectionId,
        paramInfoId,
        attachments: metadataAttachments,
      }),
      type: DependencyValueTypeEnum.Literal,
    };
    sendRealtimeDependencyEvent({
      dependencyKey,
      payload: metadataPayload,
    });
    for (const attachment of attachments) {
      if (attachment.kind !== "file") {
        continue;
      }
      const binaryPayload: BinaryDependencyValue = {
        payload: {
          contentId: attachment.contentId,
          byteLength: attachment.byteLength,
          mimeType: attachment.mimeType,
        },
        type: DependencyValueTypeEnum.Binary,
      };
      sendRealtimeDependencyEvent({
        dependencyKey,
        payload: binaryPayload,
        binaryPayload: attachment.binaryPayload,
      });
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
