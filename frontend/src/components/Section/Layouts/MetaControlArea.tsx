import type {
  ParamValueChange,
  ParamValueChangeOptions,
} from "components/Params/ParamUIs/ConfiguredParamInputs";
import { MetaControlContent } from "components/Section/Layouts/MetaControl/MetaControlNode";
import _ from "lodash";
import { setParamEnteredValue } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrCodeObjVariantIfPresent,
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  getParamDisplayNameIfPresent,
  getSectionCore,
  setCodeObjVariantImplValue,
} from "state/actions/sectionInfos";
import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionLiteral,
} from "state/actions/websocketReceive";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import type {
  BaseChildlessCodeObjImplUnion,
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
  HTTPRequestMethodEnum,
  LiteralDependencyValue,
  SectionTypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import { shouldEmitRealtimeValue } from "utils/paramValue";
import { sendButtonSettaRequest } from "./settaApiAction";
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
  const metaControlState = useProjectState((x) => {
    const sectionName = getSectionCore(x, sectionId).name;
    const paramDisplayName =
      getParamDisplayNameIfPresent(x, sectionId, controlParamId) ?? null;
    const controlImpl = getCurrEffectiveCodeObjImplIfPresent(
      x,
      sectionId,
      controlParamId,
    );
    if (!controlImpl || !paramDisplayName) {
      return null;
    }
    if (controlImpl.type === CodeObjTypeEnum.ButtonParam) {
      const buttonImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
        x,
        sectionId,
        controlParamId,
        isButtonParamCodeObjImpl,
      );
      if (!buttonImpl) {
        return null;
      }
      return {
        codeObjType: controlImpl.type,
        baseValue: "",
        defaultVal: "",
        sectionName,
        paramDisplayName,
        codeObjVariantId:
          getCurrCodeObjVariantIfPresent(x, sectionId, controlParamId)?.id ??
          null,
        sectionVariantId: getCurrSectionVariantId(x, sectionId),
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
    const childlessImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
      x,
      sectionId,
      controlParamId,
      isBaseChildlessCodeObjImpl,
    );
    if (!childlessImpl) {
      return null;
    }
    const isDropzone = childlessImpl.type === CodeObjTypeEnum.DropzoneParam;
    const isDateParam = childlessImpl.type === CodeObjTypeEnum.DateParam;
    const isTimeParam = childlessImpl.type === CodeObjTypeEnum.TimeParam;
    return {
      codeObjType: childlessImpl.type,
      baseValue: childlessImpl.value,
      defaultVal: childlessImpl.defaultVal,
      sectionName,
      paramDisplayName,
      codeObjVariantId:
        getCurrCodeObjVariantIfPresent(x, sectionId, controlParamId)?.id ??
        null,
      sectionVariantId: getCurrSectionVariantId(x, sectionId),
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
  const hasMetaControlState = metaControlState !== null;
  const codeObjType =
    metaControlState?.codeObjType ?? CodeObjTypeEnum.TextParam;
  const codeObjVariantId = metaControlState?.codeObjVariantId ?? null;
  const sectionVariantId = metaControlState?.sectionVariantId ?? null;
  const baseValue = metaControlState?.baseValue ?? "";
  const defaultVal = metaControlState?.defaultVal ?? "";
  const sectionName = metaControlState?.sectionName ?? "";
  const paramDisplayName = metaControlState?.paramDisplayName ?? "";
  const buttonConfig = metaControlState?.buttonConfig ?? null;
  const dropzoneMode = metaControlState?.dropzoneMode ?? null;
  const dropzoneMaxAttachments =
    metaControlState?.dropzoneMaxAttachments ?? null;
  const dropzonePlaceholder = metaControlState?.dropzonePlaceholder ?? null;
  const timeControlMode =
    metaControlState?.timeControlMode ?? TimeControlModeEnum.display;
  const timeDisplayFormat =
    metaControlState?.timeDisplayFormat ??
    TimeDisplayFormatEnum.twenty_four_hour;
  const timeDisplayTransparent =
    metaControlState?.timeDisplayTransparent ?? false;
  const timeDisplayScale = metaControlState?.timeDisplayScale ?? 1;
  const timeDisplayFont =
    metaControlState?.timeDisplayFont ?? TimeDisplayFontEnum.monospace;
  const dateDisplayFormat =
    metaControlState?.dateDisplayFormat ?? DateDisplayFormatEnum.iso;
  const dateControlMode =
    metaControlState?.dateControlMode ?? DateControlModeEnum.input;
  const dateSelectionMode =
    metaControlState?.dateSelectionMode ?? DateSelectionModeEnum.single;
  const dateCalendarWeekStart =
    metaControlState?.dateCalendarWeekStart ?? DateCalendarWeekStartEnum.sunday;
  const dateIncludesTime = metaControlState?.dateIncludesTime ?? false;
  const [value, setPendingValue] = useLocalPendingValue(
    baseValue,
    (pendingValue) => {
      if (
        !hasMetaControlState ||
        codeObjType === CodeObjTypeEnum.ButtonParam ||
        !codeObjVariantId
      ) {
        return;
      }
      if (codeObjType === CodeObjTypeEnum.PasswordParam) {
        return;
      }
      useProjectState.setState((state) => {
        setCodeObjVariantImplValue<BaseChildlessCodeObjImplUnion>(
          state,
          controlParamId,
          codeObjVariantId,
          {
            value: pendingValue,
          },
        );
      });
    },
    codeObjVariantId,
  );
  const handleValueChange: ParamValueChange = (
    nextValue,
    options?: ParamValueChangeOptions,
  ) => {
    if (!hasMetaControlState || codeObjType === CodeObjTypeEnum.ButtonParam) {
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
        if (!sectionVariantId) {
          return;
        }
        debouncedSetPasswordParamValue(
          sectionId,
          sectionVariantId,
          controlParamId,
          valueStr,
        );
      } else {
        if (!sectionVariantId || !codeObjVariantId) {
          return;
        }
        debouncedSetParamEnteredValue(
          sectionId,
          sectionVariantId,
          controlParamId,
          codeObjVariantId,
          valueStr,
        );
      }
    }
  };
  function handleAction() {
    if (!hasMetaControlState || !buttonConfig) {
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
    if (!hasMetaControlState || attachments.length === 0) {
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
  if (!hasMetaControlState) {
    return null;
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
  (
    sectionId: string,
    sectionVariantId: string,
    paramInfoId: string,
    codeObjVariantId: string,
    value: string,
  ) => {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCodeObjVariantImplValue<BaseChildlessCodeObjImplUnion>(
          state,
          paramInfoId,
          codeObjVariantId,
          {
            value,
          },
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setParamEnteredValue({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              sectionVariantId,
              paramInfoId,
              value,
              frontendOpId,
            },
          } as Parameters<typeof setParamEnteredValue>[0]),
        ),
    });
  },
  50,
);
const debouncedSetPasswordParamValue = _.debounce(
  (
    sectionId: string,
    sectionVariantId: string,
    paramInfoId: string,
    value: string,
  ) => {
    callOpenAPI(
      setParamEnteredValue({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          sectionVariantId,
          paramInfoId,
          value,
        },
      } as Parameters<typeof setParamEnteredValue>[0]),
    );
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
  const method = config.requestMethod ?? HTTPRequestMethodEnum.POST;
  const headerKey = config.requestHeaderKey.trim();
  let headers: HeadersInit | undefined;
  if (headerKey !== "") {
    headers = { [headerKey]: config.requestHeaderValue };
  }
  const trimmedBody = config.requestBody.trim();
  let body: string | undefined;
  if (
    trimmedBody !== "" &&
    method !== HTTPRequestMethodEnum.GET &&
    method !== HTTPRequestMethodEnum.HEAD
  ) {
    body = config.requestBody;
  }
  void fetch(requestUrl, {
    method,
    headers,
    body,
  });
}
