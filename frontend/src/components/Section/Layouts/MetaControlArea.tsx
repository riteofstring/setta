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
  getParamDisplayName,
  getSectionCore,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionLiteral,
} from "state/actions/websocketReceive";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import { post } from "utils/endpointUtils";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import type {
  BaseCodeObjImplUnion,
  ButtonParamCodeObjImpl,
} from "utils/generatedTypes";
import {
  ButtonActionModeEnum,
  CodeObjTypeEnum,
  DependencyKeyTypeEnum,
  DropzoneModeEnum,
  HttpRequestMethodEnum,
  SectionTypeEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import { buildSettaApiPayload } from "utils/settaApiPresets";

type ButtonRequestConfig = Pick<
  ButtonParamCodeObjImpl,
  | "actionMode"
  | "requestMethod"
  | "requestUrl"
  | "requestHeaderKey"
  | "requestHeaderValue"
  | "requestBody"
>;

function _MetaControlArea({ sectionId }: { sectionId: string }) {
  const { controlParamId, showSectionTitle } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.MetaControl,
    );
    return {
      controlParamId: impl.metaControlParamId,
      showSectionTitle: impl.showSectionTitle ?? false,
    };
  }, _.isEqual);

  if (!controlParamId) {
    return null;
  }

  return (
    <MetaControlValueArea
      sectionId={sectionId}
      controlParamId={controlParamId}
      showSectionTitle={showSectionTitle}
    />
  );
}

function MetaControlValueArea({
  sectionId,
  controlParamId,
  showSectionTitle,
}: {
  sectionId: string;
  controlParamId: string;
  showSectionTitle: boolean;
}) {
  const {
    codeObjType,
    baseValue,
    defaultVal,
    sectionName,
    paramDisplayName,
    buttonConfig,
    dropzoneMode,
    dropzoneMaxAttachments,
  } = useProjectState((x) => {
    const sectionName = getSectionCore(x, sectionId).name;
    const paramDisplayName = getParamDisplayName(x, sectionId, controlParamId);
    const controlImpl = getCurrEffectiveCodeObjImpl(
      x,
      sectionId,
      controlParamId,
    );
    if (controlImpl.type === CodeObjTypeEnum.ButtonParam) {
      const buttonImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
        x,
        sectionId,
        controlParamId,
        isButtonParamCodeObjImpl,
      );
      return {
        codeObjType: controlImpl.type,
        baseValue: "",
        defaultVal: "",
        sectionName,
        paramDisplayName,
        buttonConfig: {
          actionMode: buttonImpl.actionMode,
          requestMethod: buttonImpl.requestMethod,
          requestUrl: buttonImpl.requestUrl,
          requestHeaderKey: buttonImpl.requestHeaderKey,
          requestHeaderValue: buttonImpl.requestHeaderValue,
          requestBody: buttonImpl.requestBody,
        },
        dropzoneMode: null,
        dropzoneMaxAttachments: null,
      };
    }
    const childlessImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      controlParamId,
      isBaseChildlessCodeObjImpl,
    );
    const isDropzone = childlessImpl.type === CodeObjTypeEnum.DropzoneParam;
    return {
      codeObjType: childlessImpl.type,
      baseValue: childlessImpl.value,
      defaultVal: childlessImpl.defaultVal,
      sectionName,
      paramDisplayName,
      buttonConfig: null,
      dropzoneMode: isDropzone ? childlessImpl.mode : null,
      dropzoneMaxAttachments: isDropzone
        ? childlessImpl.maxAttachments ?? null
        : null,
    };
  }, _.isEqual);

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
    if (!buttonConfig) {
      return;
    }
    if (buttonConfig.actionMode === ButtonActionModeEnum.HTTP_REQUEST) {
      sendButtonHttpRequest(buttonConfig);
      return;
    }
    if (buttonConfig.actionMode === ButtonActionModeEnum.SETTA_API) {
      sendButtonSettaRequest(buttonConfig);
      return;
    }
    sendRealtimeDependencyEvent({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId,
      },
      payload: JSON.stringify({
        actionMode: buttonConfig.actionMode,
        controlParamId,
      }),
    });
  }

  function handleDropzoneStateless(attachments: DropzoneStatelessAttachment[]) {
    if (attachments.length === 0) {
      return;
    }
    sendRealtimeDependencyEvent({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId,
      },
      payload: JSON.stringify({
        sectionId,
        paramInfoId: controlParamId,
        attachments,
      }),
    });
  }

  return (
    <div className="col-span-full row-span-full flex h-full w-full items-stretch p-0">
      {codeObjType === CodeObjTypeEnum.ButtonParam ? (
        <MetaControlContent
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          paramDisplayName={paramDisplayName}
          codeObjType={codeObjType}
          onAction={handleAction}
          showSectionTitle={showSectionTitle}
        />
      ) : (
        <MetaControlContent
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          paramDisplayName={paramDisplayName}
          codeObjType={codeObjType}
          value={value}
          defaultVal={defaultVal}
          onValueChange={handleValueChange}
          onDropzoneStateless={handleDropzoneStateless}
          dropzoneMode={dropzoneMode ?? DropzoneModeEnum.STATEFUL}
          dropzoneMaxAttachments={dropzoneMaxAttachments}
          showSectionTitle={showSectionTitle}
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

function isButtonParamCodeObjImpl(
  impl: BaseCodeObjImplUnion,
): impl is ButtonParamCodeObjImpl {
  return impl.type === CodeObjTypeEnum.ButtonParam;
}

function sendButtonHttpRequest(config: ButtonRequestConfig) {
  const requestUrl = config.requestUrl.trim();
  if (requestUrl === "") {
    return;
  }

  const method = config.requestMethod ?? HttpRequestMethodEnum.POST;
  const headerKey = config.requestHeaderKey.trim();
  let headers: HeadersInit | undefined;
  if (headerKey !== "") {
    headers = { [headerKey]: config.requestHeaderValue };
  }

  const trimmedBody = config.requestBody.trim();
  let body: string | undefined;
  if (
    trimmedBody !== "" &&
    method !== HttpRequestMethodEnum.GET &&
    method !== HttpRequestMethodEnum.HEAD
  ) {
    body = config.requestBody;
  }

  void fetch(requestUrl, {
    method,
    headers,
    body,
  });
}

function sendButtonSettaRequest(config: ButtonRequestConfig) {
  const route = config.requestUrl.trim();
  if (route === "") {
    return;
  }
  const payload = buildSettaApiPayload(route, config.requestBody);
  void post(route, payload);
}
