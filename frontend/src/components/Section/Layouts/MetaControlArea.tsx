import type {
  ParamValueChange,
  ParamValueChangeOptions,
} from "components/Params/ParamUIs/ConfiguredParamInputs";
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
  BinaryDependencyValue,
  ButtonActionModeEnum,
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  DropzoneModeEnum,
  HttpRequestMethodEnum,
  LiteralDependencyValue,
  SectionTypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import { shouldEmitRealtimeValue } from "utils/paramValue";
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
    dropzonePlaceholder,
    timeControlMode,
    timeDisplayFormat,
    timeDisplayTransparent,
    timeDisplayScale,
    timeDisplayFont,
    dateDisplayFormat,
    dateControlMode,
    dateSelectionMode,
    dateCalendarWeekStart,
    dateIncludesTime,
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
        dropzonePlaceholder: null,
        timeControlMode: TimeControlModeEnum.display,
        timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
        timeDisplayTransparent: false,
        timeDisplayScale: 1,
        timeDisplayFont: TimeDisplayFontEnum.monospace,
        dateDisplayFormat: DateDisplayFormatEnum.iso,
        dateControlMode: DateControlModeEnum.input,
        dateSelectionMode: DateSelectionModeEnum.single,
        dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
        dateIncludesTime: false,
      };
    }
    const childlessImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      controlParamId,
      isBaseChildlessCodeObjImpl,
    );
    const isDropzone = childlessImpl.type === CodeObjTypeEnum.DropzoneParam;
    const isDateParam = childlessImpl.type === CodeObjTypeEnum.DateParam;
    const isTimeParam = childlessImpl.type === CodeObjTypeEnum.TimeParam;
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
      dropzonePlaceholder: isDropzone ? childlessImpl.placeholder : null,
      timeControlMode: isTimeParam
        ? childlessImpl.timeControlMode
        : TimeControlModeEnum.display,
      timeDisplayFormat: isTimeParam
        ? childlessImpl.timeDisplayFormat
        : TimeDisplayFormatEnum.twenty_four_hour,
      timeDisplayTransparent: isTimeParam
        ? childlessImpl.timeDisplayTransparent
        : false,
      timeDisplayScale: isTimeParam ? childlessImpl.timeDisplayScale : 1,
      timeDisplayFont: isTimeParam
        ? childlessImpl.timeDisplayFont
        : TimeDisplayFontEnum.monospace,
      dateDisplayFormat: isDateParam
        ? childlessImpl.dateDisplayFormat
        : DateDisplayFormatEnum.iso,
      dateControlMode: isDateParam
        ? childlessImpl.dateControlMode
        : DateControlModeEnum.input,
      dateSelectionMode: isDateParam
        ? childlessImpl.dateSelectionMode
        : DateSelectionModeEnum.single,
      dateCalendarWeekStart: isDateParam
        ? childlessImpl.dateCalendarWeekStart
        : DateCalendarWeekStartEnum.sunday,
      dateIncludesTime: isDateParam ? childlessImpl.dateIncludesTime : false,
    };
  }, _.isEqual);

  const [value, setPendingValue] = useLocalPendingValue(
    baseValue,
    (pendingValue) => {
      if (codeObjType === CodeObjTypeEnum.ButtonParam) {
        return;
      }
      if (codeObjType === CodeObjTypeEnum.PasswordParam) {
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

  const handleValueChange: ParamValueChange = (
    nextValue,
    options?: ParamValueChangeOptions,
  ) => {
    if (codeObjType === CodeObjTypeEnum.ButtonParam) {
      return;
    }
    if (nextValue === null) {
      return;
    }
    const valueStr = _.toString(nextValue);
    setPendingValue(valueStr);
    if (
      shouldEmitRealtimeValue({
        previousValue: value,
        nextValue: valueStr,
        codeObjType,
      })
    ) {
      sendRealtimeSectionLiteral(sectionId, valueStr);
    }
    if (!options?.skipBackendUpdate) {
      if (codeObjType === CodeObjTypeEnum.PasswordParam) {
        debouncedSetPasswordParamValue(sectionId, controlParamId, valueStr);
      } else {
        debouncedSetParamEnteredValue(sectionId, controlParamId, valueStr);
      }
    }
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
    const payload: LiteralDependencyValue = {
      payload: JSON.stringify({
        actionMode: buttonConfig.actionMode,
        controlParamId,
      }),
      type: DependencyValueTypeEnum.Literal,
    };
    sendRealtimeDependencyEvent({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId,
      },
      payload,
    });
  }

  function handleDropzoneStateless(attachments: DropzoneStatelessAttachment[]) {
    if (attachments.length === 0) {
      return;
    }
    const dependencyKey = {
      type: DependencyKeyTypeEnum.Section,
      sectionId,
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
        paramInfoId: controlParamId,
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
    <div className="col-span-full row-span-full flex h-full min-h-0 w-full flex-1 items-stretch self-stretch p-0">
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
          dropzonePlaceholder={dropzonePlaceholder ?? undefined}
          timeControlMode={timeControlMode}
          timeDisplayFormat={timeDisplayFormat}
          timeDisplayTransparent={timeDisplayTransparent}
          timeDisplayScale={timeDisplayScale}
          timeDisplayFont={timeDisplayFont}
          dateDisplayFormat={dateDisplayFormat}
          dateControlMode={dateControlMode}
          dateSelectionMode={dateSelectionMode}
          dateCalendarWeekStart={dateCalendarWeekStart}
          dateIncludesTime={dateIncludesTime}
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

const debouncedSetPasswordParamValue = _.debounce(
  (sectionId: string, paramInfoId: string, value: string) => {
    route_set_param_entered_value({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
      value,
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
