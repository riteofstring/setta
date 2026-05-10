import type { DropzoneStatelessAttachment } from "@setta/app-subsystem-frontend-sdk";
import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import type {
  ParamValueChange,
  ParamValueChangeOptions,
} from "components/Params/ParamUIs/ConfiguredParamInputs";
import { MetaControlContent } from "components/Section/Layouts/MetaControl/MetaControlNode";
import _ from "lodash";
import { setParamEnteredValue } from "openapi/http";
import React from "react";
import {
  createChromeReproPerfTimer,
  nowChromeReproPerformanceMs,
  postChromeReproPerfEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";
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
type ProjectStateSnapshot = Parameters<typeof getSectionCore>[0];
type MetaControlSharedState = {
  sectionName: string;
  paramDisplayName: string;
  codeObjVariantId: string | null;
  sectionVariantId: string | null;
};
type MetaControlButtonState = MetaControlSharedState & {
  codeObjType: CodeObjTypeEnum.ButtonParam;
  buttonConfig: ButtonRequestConfig;
};
type MetaControlValueState = MetaControlSharedState & {
  codeObjType: BaseChildlessCodeObjImplUnion["type"];
  baseValue: string;
  defaultVal: string;
  dropzoneMode: DropzoneModeEnum | null;
  dropzoneMaxAttachments: number | null;
  dropzonePlaceholder: string | null;
  timeControlMode: TimeControlModeEnum;
  timeDisplayFormat: TimeDisplayFormatEnum;
  timeDisplayTransparent: boolean;
  timeDisplayScale: number;
  timeDisplayFont: TimeDisplayFontEnum;
  dateDisplayFormat: DateDisplayFormatEnum;
  dateControlMode: DateControlModeEnum;
  dateSelectionMode: DateSelectionModeEnum;
  dateCalendarWeekStart: DateCalendarWeekStartEnum;
  dateIncludesTime: boolean;
};
type MetaControlState = MetaControlButtonState | MetaControlValueState;

const DEFAULT_TIME_META_CONTROL = {
  timeControlMode: TimeControlModeEnum.display,
  timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
  timeDisplayTransparent: false,
  timeDisplayScale: 1,
  timeDisplayFont: TimeDisplayFontEnum.monospace,
};

const DEFAULT_DATE_META_CONTROL = {
  dateDisplayFormat: DateDisplayFormatEnum.iso,
  dateControlMode: DateControlModeEnum.input,
  dateSelectionMode: DateSelectionModeEnum.single,
  dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
  dateIncludesTime: false,
};

function useMetaControlState(sectionId: string, controlParamId: string) {
  return useProjectState(
    (state) => resolveMetaControlState(state, sectionId, controlParamId),
    _.isEqual,
  );
}

function resolveMetaControlState(
  state: ProjectStateSnapshot,
  sectionId: string,
  controlParamId: string,
): MetaControlState | null {
  const sharedState = readMetaControlSharedState(
    state,
    sectionId,
    controlParamId,
  );
  if (!sharedState) {
    return null;
  }
  if (sharedState.controlImpl.type === CodeObjTypeEnum.ButtonParam) {
    return buildButtonMetaControlState(
      state,
      sectionId,
      controlParamId,
      sharedState,
    );
  }
  return buildValueMetaControlState(
    state,
    sectionId,
    controlParamId,
    sharedState,
  );
}

function readMetaControlSharedState(
  state: ProjectStateSnapshot,
  sectionId: string,
  controlParamId: string,
) {
  const paramDisplayName =
    getParamDisplayNameIfPresent(state, sectionId, controlParamId) ?? null;
  const controlImpl = getCurrEffectiveCodeObjImplIfPresent(
    state,
    sectionId,
    controlParamId,
  );
  if (!controlImpl || !paramDisplayName) {
    return null;
  }
  return {
    controlImpl,
    sectionName: getSectionCore(state, sectionId).name,
    paramDisplayName,
    codeObjVariantId:
      getCurrCodeObjVariantIfPresent(state, sectionId, controlParamId)?.id ??
      null,
    sectionVariantId: getCurrSectionVariantId(state, sectionId),
  };
}

function buildButtonMetaControlState(
  state: ProjectStateSnapshot,
  sectionId: string,
  controlParamId: string,
  sharedState: MetaControlSharedState & {
    controlImpl: BaseCodeObjImplUnion;
  },
): MetaControlButtonState | null {
  const buttonImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    state,
    sectionId,
    controlParamId,
    isButtonParamCodeObjImpl,
  );
  if (!buttonImpl) {
    return null;
  }
  return {
    ...sharedState,
    codeObjType: CodeObjTypeEnum.ButtonParam,
    buttonConfig: buildButtonRequestConfig(buttonImpl),
  };
}

function buildButtonRequestConfig(
  buttonImpl: ButtonParamCodeObjImpl,
): ButtonRequestConfig {
  return {
    actionMode: buttonImpl.actionMode,
    requestMethod: buttonImpl.requestMethod,
    requestUrl: buttonImpl.requestUrl,
    requestHeaderKey: buttonImpl.requestHeaderKey,
    requestHeaderValue: buttonImpl.requestHeaderValue,
    requestBody: buttonImpl.requestBody,
  };
}

function buildValueMetaControlState(
  state: ProjectStateSnapshot,
  sectionId: string,
  controlParamId: string,
  sharedState: MetaControlSharedState & {
    controlImpl: BaseCodeObjImplUnion;
  },
): MetaControlValueState | null {
  const childlessImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    state,
    sectionId,
    controlParamId,
    isBaseChildlessCodeObjImpl,
  );
  if (!childlessImpl) {
    return null;
  }
  return {
    ...sharedState,
    codeObjType: childlessImpl.type,
    baseValue: childlessImpl.value,
    defaultVal: childlessImpl.defaultVal,
    ...buildDropzoneMetaControlState(childlessImpl),
    ...buildTimeMetaControlState(childlessImpl),
    ...buildDateMetaControlState(childlessImpl),
  };
}

function buildDropzoneMetaControlState(
  childlessImpl: BaseChildlessCodeObjImplUnion,
) {
  if (childlessImpl.type !== CodeObjTypeEnum.DropzoneParam) {
    return {
      dropzoneMode: null,
      dropzoneMaxAttachments: null,
      dropzonePlaceholder: null,
    };
  }
  return {
    dropzoneMode: childlessImpl.mode,
    dropzoneMaxAttachments: childlessImpl.maxAttachments ?? null,
    dropzonePlaceholder: childlessImpl.placeholder,
  };
}

function buildTimeMetaControlState(
  childlessImpl: BaseChildlessCodeObjImplUnion,
) {
  if (childlessImpl.type !== CodeObjTypeEnum.TimeParam) {
    return DEFAULT_TIME_META_CONTROL;
  }
  return {
    timeControlMode: childlessImpl.timeControlMode,
    timeDisplayFormat: childlessImpl.timeDisplayFormat,
    timeDisplayTransparent: childlessImpl.timeDisplayTransparent,
    timeDisplayScale: childlessImpl.timeDisplayScale,
    timeDisplayFont: childlessImpl.timeDisplayFont,
  };
}

function buildDateMetaControlState(
  childlessImpl: BaseChildlessCodeObjImplUnion,
) {
  if (childlessImpl.type !== CodeObjTypeEnum.DateParam) {
    return DEFAULT_DATE_META_CONTROL;
  }
  return {
    dateDisplayFormat: childlessImpl.dateDisplayFormat,
    dateControlMode: childlessImpl.dateControlMode,
    dateSelectionMode: childlessImpl.dateSelectionMode,
    dateCalendarWeekStart: childlessImpl.dateCalendarWeekStart,
    dateIncludesTime: childlessImpl.dateIncludesTime,
  };
}

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
  const metaControlState = useMetaControlState(sectionId, controlParamId);
  if (!metaControlState) {
    return null;
  }
  return (
    <div className="col-span-full row-span-full flex h-full w-full items-stretch p-0">
      {isButtonMetaControlState(metaControlState) ? (
        <ButtonMetaControlContent
          sectionId={sectionId}
          controlParamId={controlParamId}
          showSectionTitle={showSectionTitle}
          state={metaControlState}
        />
      ) : (
        <ValueMetaControlContent
          sectionId={sectionId}
          controlParamId={controlParamId}
          showSectionTitle={showSectionTitle}
          state={metaControlState}
        />
      )}
    </div>
  );
}

function isButtonMetaControlState(
  metaControlState: MetaControlState,
): metaControlState is MetaControlButtonState {
  return metaControlState.codeObjType === CodeObjTypeEnum.ButtonParam;
}

function ButtonMetaControlContent({
  sectionId,
  controlParamId,
  showSectionTitle,
  state,
}: {
  sectionId: string;
  controlParamId: string;
  showSectionTitle: boolean;
  state: MetaControlButtonState;
}) {
  return (
    <MetaControlContent
      sectionId={sectionId}
      controlParamId={controlParamId}
      sectionName={state.sectionName}
      paramDisplayName={state.paramDisplayName}
      codeObjType={state.codeObjType}
      onAction={() =>
        handleMetaControlButtonAction(
          state.buttonConfig,
          sectionId,
          controlParamId,
        )
      }
      showSectionTitle={showSectionTitle}
    />
  );
}

function handleMetaControlButtonAction(
  buttonConfig: ButtonRequestConfig,
  sectionId: string,
  controlParamId: string,
) {
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

function ValueMetaControlContent({
  sectionId,
  controlParamId,
  showSectionTitle,
  state,
}: {
  sectionId: string;
  controlParamId: string;
  showSectionTitle: boolean;
  state: MetaControlValueState;
}) {
  const [value, setPendingValue] = useLocalPendingValue(
    state.baseValue,
    (pendingValue) =>
      syncLocalMetaControlValue(
        controlParamId,
        state.codeObjVariantId,
        state.codeObjType,
        pendingValue,
      ),
    state.codeObjVariantId,
  );
  const handleValueChange: ParamValueChange = (
    nextValue,
    options?: ParamValueChangeOptions,
  ) => {
    applyMetaControlValueChange({
      nextValue,
      options,
      currentValue: value,
      setPendingValue,
      sectionId,
      controlParamId,
      codeObjType: state.codeObjType,
      sectionVariantId: state.sectionVariantId,
      codeObjVariantId: state.codeObjVariantId,
    });
  };
  return (
    <MetaControlContent
      sectionId={sectionId}
      controlParamId={controlParamId}
      sectionName={state.sectionName}
      paramDisplayName={state.paramDisplayName}
      codeObjType={state.codeObjType}
      value={value}
      defaultVal={state.defaultVal}
      onValueChange={handleValueChange}
      onDropzoneStateless={(attachments) =>
        handleDropzoneStateless(sectionId, controlParamId, attachments)
      }
      dropzoneMode={state.dropzoneMode ?? DropzoneModeEnum.STATEFUL}
      dropzoneMaxAttachments={state.dropzoneMaxAttachments}
      dropzonePlaceholder={state.dropzonePlaceholder ?? undefined}
      timeControlMode={state.timeControlMode}
      timeDisplayFormat={state.timeDisplayFormat}
      timeDisplayTransparent={state.timeDisplayTransparent}
      timeDisplayScale={state.timeDisplayScale}
      timeDisplayFont={state.timeDisplayFont}
      dateDisplayFormat={state.dateDisplayFormat}
      dateControlMode={state.dateControlMode}
      dateSelectionMode={state.dateSelectionMode}
      dateCalendarWeekStart={state.dateCalendarWeekStart}
      dateIncludesTime={state.dateIncludesTime}
      showSectionTitle={showSectionTitle}
    />
  );
}

function syncLocalMetaControlValue(
  controlParamId: string,
  codeObjVariantId: string | null,
  codeObjType: BaseChildlessCodeObjImplUnion["type"],
  pendingValue: string,
) {
  if (!codeObjVariantId || codeObjType === CodeObjTypeEnum.PasswordParam) {
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
}

function applyMetaControlValueChange({
  nextValue,
  options,
  currentValue,
  setPendingValue,
  sectionId,
  controlParamId,
  codeObjType,
  sectionVariantId,
  codeObjVariantId,
}: {
  nextValue: string | number | boolean | null;
  options?: ParamValueChangeOptions;
  currentValue: string;
  setPendingValue: (value: string) => void;
  sectionId: string;
  controlParamId: string;
  codeObjType: BaseChildlessCodeObjImplUnion["type"];
  sectionVariantId: string | null;
  codeObjVariantId: string | null;
}) {
  if (nextValue === null) {
    return;
  }
  const valueStr = _.toString(nextValue);
  const timer = createChromeReproPerfTimer("meta-control-value-change", {
    codeObjType,
    controlParamId,
    hasCodeObjVariantId: codeObjVariantId !== null,
    hasSectionVariantId: sectionVariantId !== null,
    sectionId,
    skipBackendUpdate: options?.skipBackendUpdate === true,
    valueLength: valueStr.length,
    valueType: typeof nextValue,
  });
  setPendingValue(valueStr);
  timer.mark("set-pending-value");
  let realtimeEmitted = false;
  if (
    shouldEmitRealtimeValue({
      previousValue: currentValue,
      nextValue: valueStr,
      codeObjType,
    })
  ) {
    sendRealtimeSectionLiteral(sectionId, valueStr);
    realtimeEmitted = true;
  }
  timer.mark("realtime-literal");
  if (options?.skipBackendUpdate) {
    timer.finish({
      backendUpdateQueued: false,
      realtimeEmitted,
    });
    return;
  }
  sendMetaControlBackendUpdate({
    sectionId,
    sectionVariantId,
    controlParamId,
    codeObjVariantId,
    codeObjType,
    value: valueStr,
  });
  timer.mark("queue-backend-update");
  timer.finish({
    backendUpdateQueued: true,
    realtimeEmitted,
  });
}

function sendMetaControlBackendUpdate({
  sectionId,
  sectionVariantId,
  controlParamId,
  codeObjVariantId,
  codeObjType,
  value,
}: {
  sectionId: string;
  sectionVariantId: string | null;
  controlParamId: string;
  codeObjVariantId: string | null;
  codeObjType: BaseChildlessCodeObjImplUnion["type"];
  value: string;
}) {
  if (!sectionVariantId) {
    return;
  }
  if (codeObjType === CodeObjTypeEnum.PasswordParam) {
    debouncedSetPasswordParamValue(
      sectionId,
      sectionVariantId,
      controlParamId,
      value,
    );
    return;
  }
  if (!codeObjVariantId) {
    return;
  }
  debouncedSetParamEnteredValue(
    sectionId,
    sectionVariantId,
    controlParamId,
    codeObjVariantId,
    value,
  );
}

function handleDropzoneStateless(
  sectionId: string,
  controlParamId: string,
  attachments: DropzoneStatelessAttachment[],
) {
  if (attachments.length === 0) {
    return;
  }
  const dependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  sendRealtimeDependencyEvent({
    dependencyKey,
    payload: buildDropzoneMetadataPayload(
      sectionId,
      controlParamId,
      attachments,
    ),
  });
  for (const attachment of attachments) {
    if (attachment.kind !== "file") {
      continue;
    }
    sendRealtimeDependencyEvent({
      dependencyKey,
      payload: buildDropzoneBinaryPayload(attachment),
      binaryPayload: attachment.binaryPayload,
    });
  }
}

function buildDropzoneMetadataPayload(
  sectionId: string,
  controlParamId: string,
  attachments: DropzoneStatelessAttachment[],
): LiteralDependencyValue {
  return {
    payload: JSON.stringify({
      sectionId,
      paramInfoId: controlParamId,
      attachments: attachments.map((attachment) =>
        attachment.kind === "file"
          ? {
              kind: attachment.kind,
              name: attachment.name,
              mimeType: attachment.mimeType,
              size: attachment.size,
              contentId: attachment.contentId,
              byteLength: attachment.byteLength,
            }
          : attachment,
      ),
    }),
    type: DependencyValueTypeEnum.Literal,
  };
}

function buildDropzoneBinaryPayload(
  attachment: Extract<DropzoneStatelessAttachment, { kind: "file" }>,
): BinaryDependencyValue {
  return {
    payload: {
      contentId: attachment.contentId,
      byteLength: attachment.byteLength,
      mimeType: attachment.mimeType,
    },
    type: DependencyValueTypeEnum.Binary,
  };
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
    const timer = createChromeReproPerfTimer("set-param-entered-value", {
      codeObjVariantId,
      paramInfoId,
      sectionId,
      sectionVariantId,
      valueLength: value.length,
    });
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const applyStartedAt = timer.active
          ? nowChromeReproPerformanceMs()
          : null;
        setCodeObjVariantImplValue<BaseChildlessCodeObjImplUnion>(
          state,
          paramInfoId,
          codeObjVariantId,
          {
            value,
          },
        );
        if (applyStartedAt !== null) {
          postChromeReproPerfEvent("set-param-optimistic-apply", {
            codeObjVariantId,
            durationMs: roundChromeReproMs(
              nowChromeReproPerformanceMs() - applyStartedAt,
            ),
            paramInfoId,
            sectionId,
            sectionVariantId,
            valueLength: value.length,
          });
        }
      },
      send: (frontendOpId) => {
        timer.mark("optimistic-dispatch");
        const requestStartedAt = timer.active
          ? nowChromeReproPerformanceMs()
          : null;
        if (requestStartedAt !== null) {
          postChromeReproPerfEvent("set-param-request-start", {
            codeObjVariantId,
            frontendOpId,
            paramInfoId,
            sectionId,
            sectionVariantId,
            valueLength: value.length,
          });
        }
        const request = callOpenAPI(
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
        );
        void Promise.resolve(request).then(
          (response) => {
            if (requestStartedAt === null) {
              return;
            }
            postChromeReproPerfEvent("set-param-request-finish", {
              codeObjVariantId,
              durationMs: roundChromeReproMs(
                nowChromeReproPerformanceMs() - requestStartedAt,
              ),
              frontendOpId,
              hasResponse:
                typeof response === "object" &&
                response !== null &&
                "hasResponse" in response
                  ? response.hasResponse
                  : null,
              paramInfoId,
              sectionId,
              sectionVariantId,
              status:
                typeof response === "object" &&
                response !== null &&
                "status" in response
                  ? response.status
                  : null,
              valueLength: value.length,
            });
          },
          (error) => {
            if (requestStartedAt === null) {
              return;
            }
            postChromeReproPerfEvent("set-param-request-finish", {
              codeObjVariantId,
              durationMs: roundChromeReproMs(
                nowChromeReproPerformanceMs() - requestStartedAt,
              ),
              error: error instanceof Error ? error.message : String(error),
              frontendOpId,
              paramInfoId,
              sectionId,
              sectionVariantId,
              valueLength: value.length,
            });
          },
        );
        return request;
      },
    });
    timer.finish();
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
