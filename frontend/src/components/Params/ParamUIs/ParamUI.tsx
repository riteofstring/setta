import type { DropzoneStatelessAttachment } from "@setta/app-subsystem-frontend-sdk";
import { shouldShowPasswordReveal } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
} from "state/actions/sectionInfos";
import { useMisc, useProjectState, useShareSession } from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import { useShareCapabilities } from "state/hooks/share";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { focusOnSection } from "utils/focusManager";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStart,
  DateCalendarWeekStartEnum,
  DateControlMode,
  DateControlModeEnum,
  DateDisplayFormat,
  DateDisplayFormatEnum,
  DateSelectionMode,
  DateSelectionModeEnum,
  DropzoneModeEnum,
  TextParamInputUIType,
  TextParamInputUITypeEnum,
  TimeControlMode,
  TimeControlModeEnum,
  TimeDisplayFont,
  TimeDisplayFontEnum,
  TimeDisplayFormat,
  TimeDisplayFormatEnum,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  type CodeObjType,
} from "utils/generatedTypes";
import { ButtonInputConfigForParam } from "./ButtonInput";
import { ColorPickerInputConfigForParam } from "./ColorPickerInput";
import {
  ConfiguredColorPickerInput,
  ConfiguredDropdownInput,
  ConfiguredRotaryInput,
  ConfiguredSliderInput,
  ParamValueChange,
} from "./ConfiguredParamInputs";
import { DropdownInputConfigForParam } from "./DropdownInput";
import { DropzoneInput, DropzoneInputConfigForParam } from "./DropzoneInput";
import { resolveParamUIDisabled } from "./paramUIDisabled";
import {
  SPECIALIZED_PARAM_RENDERER_FAMILIES,
  TEXT_LIKE_PARAM_TYPES,
} from "./paramUIRendererMetadata";
import { PasswordInput } from "./PasswordInput";
import { SliderInputConfigForParam } from "./SliderInput";
import { SwitchInput } from "./SwitchInput";
import {
  TextParamConfigured,
  type ParamUITextInputInitialActivationEvent,
} from "./TextParamConfigured";
import {
  DateParamInputConfigForParam,
  TextParamDateTimeInput,
  TimeParamInputConfigForParam,
} from "./TextParamInput";

type ParamUIProps = {
  sectionId: string;
  paramInfoId: string;
  value: string;
  onChange: ParamValueChange;
  onTextInputBlur?: () => void;
  onDropzoneStateless?: (attachments: DropzoneStatelessAttachment[]) => void;
  onRevealPassword?: () => void;
  isPasswordRevealPending?: boolean;
  focusActiveSectionOnTextInput?: boolean;
  textInputInitialActivationEvent?: ParamUITextInputInitialActivationEvent | null;
  maybeErrorMessage?: string;
  tooltipParentDivId?: string | null | undefined;
};

export type { ParamUITextInputInitialActivationEvent } from "./TextParamConfigured";

type ParamUIState = {
  codeObjType: CodeObjType;
  passwordHasSecret: boolean;
  configLanguage: string;
  defaultVal: string;
  disabledOrFrozen: boolean;
  dropzoneMode: DropzoneModeEnum;
  dropzoneMaxAttachments: number | null;
  dropzonePlaceholder: string;
  timeControlMode: TimeControlMode;
  timeDisplayFormat: TimeDisplayFormat;
  timeDisplayTransparent: boolean;
  timeDisplayScale: number;
  timeDisplayFont: TimeDisplayFont;
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
  dateIncludesTime: boolean;
};

type ParamUIRenderContext = ParamUIProps & {
  isDisabled: boolean;
  isSelectingParams: boolean;
  onEscape: () => void;
  paramUiState: ParamUIState;
  showPasswordReveal: boolean;
  passwordPlaceholder?: string;
  waitingForResult: boolean;
};
type ParamUIRenderer = (context: ParamUIRenderContext) => JSX.Element | null;
function createBaseParamUIState({
  codeObjType,
  defaultVal,
  configLanguage,
  disabledOrFrozen,
}: {
  codeObjType: CodeObjTypeEnum;
  defaultVal: string;
  configLanguage: string;
  disabledOrFrozen: boolean;
}): ParamUIState {
  return {
    codeObjType,
    passwordHasSecret: false,
    configLanguage,
    defaultVal,
    disabledOrFrozen,
    dropzoneMode: DropzoneModeEnum.STATEFUL,
    dropzoneMaxAttachments: null,
    dropzonePlaceholder: "",
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

function useParamUIState(
  sectionId: string,
  paramInfoId: string,
): ParamUIState | null {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
      x,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
    );
    if (!impl || !codeObjImpl) {
      return null;
    }

    const baseState = createBaseParamUIState({
      codeObjType: codeObjImpl.type,
      defaultVal: codeObjImpl.defaultVal,
      configLanguage: impl.configLanguage,
      disabledOrFrozen: impl.isFrozen,
    });

    switch (codeObjImpl.type) {
      case CodeObjTypeEnum.PasswordParam:
        return {
          ...baseState,
          passwordHasSecret: codeObjImpl.hasSecret,
        };
      case CodeObjTypeEnum.DropzoneParam:
        return {
          ...baseState,
          dropzoneMode: codeObjImpl.mode,
          dropzoneMaxAttachments: codeObjImpl.maxAttachments ?? null,
          dropzonePlaceholder: codeObjImpl.placeholder,
        };
      case CodeObjTypeEnum.TimeParam:
        return {
          ...baseState,
          timeControlMode: codeObjImpl.timeControlMode,
          timeDisplayFormat: codeObjImpl.timeDisplayFormat,
          timeDisplayTransparent: codeObjImpl.timeDisplayTransparent,
          timeDisplayScale: codeObjImpl.timeDisplayScale,
          timeDisplayFont: codeObjImpl.timeDisplayFont,
        };
      case CodeObjTypeEnum.DateParam:
        return {
          ...baseState,
          dateDisplayFormat: codeObjImpl.dateDisplayFormat,
          dateControlMode: codeObjImpl.dateControlMode,
          dateSelectionMode: codeObjImpl.dateSelectionMode,
          dateCalendarWeekStart: codeObjImpl.dateCalendarWeekStart,
          dateIncludesTime: codeObjImpl.dateIncludesTime,
        };
      default:
        return baseState;
    }
  }, _.isEqual);
}

function isTextLikeParamType(codeObjType: CodeObjType): boolean {
  return (TEXT_LIKE_PARAM_TYPES as readonly CodeObjType[]).includes(
    codeObjType,
  );
}

function resolvePasswordRevealState({
  isDeploymentMode,
  value,
  hasSecret,
}: {
  isDeploymentMode: boolean;
  value: string;
  hasSecret: boolean;
}): {
  showPasswordReveal: boolean;
  passwordPlaceholder?: string;
} {
  return {
    showPasswordReveal:
      !isDeploymentMode &&
      shouldShowPasswordReveal({
        value,
        hasSecret,
      }),
    passwordPlaceholder: hasSecret && value === "" ? "Saved" : undefined,
  };
}

function renderTextLikeParam({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onTextInputBlur,
  onEscape,
  maybeErrorMessage,
  focusActiveSectionOnTextInput,
  textInputInitialActivationEvent,
  tooltipParentDivId,
  isDisabled,
  isSelectingParams,
  paramUiState,
  waitingForResult,
}: ParamUIRenderContext) {
  if (!isTextLikeParamType(paramUiState.codeObjType)) {
    return null;
  }

  return (
    <TextParamConfigured
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      defaultVal={paramUiState.defaultVal}
      onChange={onChange}
      onBlur={onTextInputBlur}
      onEscape={onEscape}
      maybeErrorMessage={maybeErrorMessage}
      isDisabled={isDisabled}
      codeObjType={paramUiState.codeObjType}
      configLanguage={paramUiState.configLanguage}
      waitingForResult={waitingForResult}
      isSelectingParams={isSelectingParams}
      focusActiveSectionOnTextInput={focusActiveSectionOnTextInput ?? true}
      textInputInitialActivationEvent={textInputInitialActivationEvent}
      tooltipParentDivId={tooltipParentDivId}
    />
  );
}

function renderDateTimeParam({
  value,
  onChange,
  onEscape,
  isDisabled,
  paramUiState,
}: ParamUIRenderContext) {
  if (paramUiState.codeObjType === CodeObjTypeEnum.DateParam) {
    return (
      <TextParamDateTimeConfigured
        value={value}
        onChange={onChange}
        onEscape={onEscape}
        isDisabled={isDisabled}
        uiType={TextParamInputUITypeEnum.date}
        timeControlMode={TimeControlModeEnum.display}
        timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
        timeDisplayTransparent={false}
        timeDisplayScale={1}
        timeDisplayFont={TimeDisplayFontEnum.monospace}
        dateDisplayFormat={paramUiState.dateDisplayFormat}
        dateControlMode={paramUiState.dateControlMode}
        dateSelectionMode={paramUiState.dateSelectionMode}
        dateCalendarWeekStart={paramUiState.dateCalendarWeekStart}
        dateIncludesTime={paramUiState.dateIncludesTime}
      />
    );
  }

  if (paramUiState.codeObjType !== CodeObjTypeEnum.TimeParam) {
    return null;
  }

  return (
    <TextParamDateTimeConfigured
      value={value}
      onChange={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
      uiType={TextParamInputUITypeEnum.time}
      timeControlMode={paramUiState.timeControlMode}
      timeDisplayFormat={paramUiState.timeDisplayFormat}
      timeDisplayTransparent={paramUiState.timeDisplayTransparent}
      timeDisplayScale={paramUiState.timeDisplayScale}
      timeDisplayFont={paramUiState.timeDisplayFont}
      dateDisplayFormat={DateDisplayFormatEnum.iso}
      dateControlMode={DateControlModeEnum.input}
      dateSelectionMode={DateSelectionModeEnum.single}
      dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
      dateIncludesTime={false}
    />
  );
}

function renderSliderParam({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onEscape,
  isDisabled,
}: ParamUIRenderContext) {
  return (
    <SliderParamConfigured
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={(nextValue) => onChange(nextValue, { skipBackendUpdate: true })}
      onCommit={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
    />
  );
}

function renderRotaryParam({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onEscape,
  isDisabled,
}: ParamUIRenderContext) {
  return (
    <RotaryParamConfigured
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={(nextValue) => onChange(nextValue, { skipBackendUpdate: true })}
      onCommit={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
    />
  );
}

function renderSwitchParam({
  value,
  onChange,
  onEscape,
  isDisabled,
  paramUiState,
}: ParamUIRenderContext) {
  return (
    <SwitchParamConfigured
      value={value}
      defaultVal={paramUiState.defaultVal}
      onChange={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
    />
  );
}

function renderColorPickerParam({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onEscape,
  isDisabled,
}: ParamUIRenderContext) {
  return (
    <ColorPickerParamConfigured
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={(nextValue) => onChange(nextValue, { skipBackendUpdate: true })}
      onCommit={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
    />
  );
}

function renderDropdownParam({
  sectionId,
  paramInfoId,
  value,
  onChange,
  isDisabled,
}: ParamUIRenderContext) {
  return (
    <DropdownParamConfigured
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
    />
  );
}

function renderPasswordParam({
  value,
  onChange,
  onEscape,
  isDisabled,
  isSelectingParams,
  showPasswordReveal,
  onRevealPassword,
  isPasswordRevealPending,
  passwordPlaceholder,
}: ParamUIRenderContext) {
  return (
    <PasswordParamConfigured
      value={value}
      onChange={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
      isSelectingParams={isSelectingParams}
      showReveal={showPasswordReveal}
      onReveal={onRevealPassword}
      isRevealing={isPasswordRevealPending ?? false}
      placeholder={passwordPlaceholder}
    />
  );
}

function renderDropzoneParam({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onDropzoneStateless,
  isDisabled,
  paramUiState,
}: ParamUIRenderContext) {
  return (
    <DropzoneParamConfigured
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onStatelessDrop={onDropzoneStateless}
      isDisabled={isDisabled}
      mode={paramUiState.dropzoneMode}
      maxAttachments={paramUiState.dropzoneMaxAttachments}
      placeholder={paramUiState.dropzonePlaceholder || undefined}
    />
  );
}

const SPECIALIZED_PARAM_RENDERERS: Partial<
  Record<CodeObjType, ParamUIRenderer>
> = {
  [CodeObjTypeEnum.SliderParam]: renderSliderParam,
  [CodeObjTypeEnum.RotaryParam]: renderRotaryParam,
  [CodeObjTypeEnum.SwitchParam]: renderSwitchParam,
  [CodeObjTypeEnum.ColorPickerParam]: renderColorPickerParam,
  [CodeObjTypeEnum.DropdownParam]: renderDropdownParam,
  [CodeObjTypeEnum.PasswordParam]: renderPasswordParam,
  [CodeObjTypeEnum.DropzoneParam]: renderDropzoneParam,
} satisfies Record<
  keyof typeof SPECIALIZED_PARAM_RENDERER_FAMILIES,
  ParamUIRenderer
>;

function renderSpecializedParam(context: ParamUIRenderContext) {
  const renderParam =
    SPECIALIZED_PARAM_RENDERERS[context.paramUiState.codeObjType];
  return renderParam?.(context) ?? null;
}

export function ParamUIConfig({
  sectionId,
  paramInfoId,
  baseImplId,
  codeObjTypeFilterKey = "sectionParam",
}: {
  sectionId: string;
  paramInfoId: string;
  baseImplId: string;
  codeObjTypeFilterKey?: "control" | "sectionParam";
}) {
  const implType = useProjectState((x) => x.codeObjImpls[baseImplId]?.type);

  switch (implType) {
    case CodeObjTypeEnum.SliderParam:
      return (
        <SliderInputConfigForParam
          sectionId={sectionId}
          paramInfoId={paramInfoId}
        />
      );
    case CodeObjTypeEnum.ColorPickerParam:
      return (
        <ColorPickerInputConfigForParam
          sectionId={sectionId}
          paramInfoId={paramInfoId}
        />
      );
    case CodeObjTypeEnum.DropdownParam:
      return (
        <DropdownInputConfigForParam
          sectionId={sectionId}
          paramInfoId={paramInfoId}
        />
      );
    case CodeObjTypeEnum.ButtonParam:
      return (
        <ButtonInputConfigForParam
          sectionId={sectionId}
          paramInfoId={paramInfoId}
        />
      );
    case CodeObjTypeEnum.DropzoneParam:
      return (
        <DropzoneInputConfigForParam
          sectionId={sectionId}
          paramInfoId={paramInfoId}
        />
      );
    case CodeObjTypeEnum.DateParam:
      return (
        <DateParamInputConfigForParam
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          allowCalendarUi={codeObjTypeFilterKey === "control"}
        />
      );
    case CodeObjTypeEnum.TimeParam:
      return (
        <TimeParamInputConfigForParam
          sectionId={sectionId}
          paramInfoId={paramInfoId}
        />
      );
    default:
      return null;
  }
}

export function ParamUI({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onTextInputBlur,
  onDropzoneStateless,
  onRevealPassword,
  isPasswordRevealPending,
  focusActiveSectionOnTextInput,
  textInputInitialActivationEvent,
  maybeErrorMessage,
  tooltipParentDivId,
}: ParamUIProps) {
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const { canEditParams } = useShareCapabilities();
  const paramUiState = useParamUIState(sectionId, paramInfoId);
  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId,
  });
  if (paramUiState === null) {
    return null;
  }

  const isCodeParam = paramUiState.codeObjType === CodeObjTypeEnum.CodeParam;
  const isDisabled = resolveParamUIDisabled({
    isSelectingParams,
    disabledOrFrozen: paramUiState.disabledOrFrozen,
    canEditParams,
    isDeploymentMode,
    isCodeParam,
  });
  const { showPasswordReveal, passwordPlaceholder } =
    resolvePasswordRevealState({
      isDeploymentMode,
      value,
      hasSecret: paramUiState.passwordHasSecret,
    });

  function onEscape() {
    focusOnSection(null, sectionId, false);
  }

  const renderContext = {
    sectionId,
    paramInfoId,
    value,
    onChange,
    onTextInputBlur,
    onDropzoneStateless,
    onRevealPassword,
    isPasswordRevealPending,
    focusActiveSectionOnTextInput,
    textInputInitialActivationEvent,
    maybeErrorMessage,
    tooltipParentDivId,
    isDisabled,
    isSelectingParams,
    onEscape,
    paramUiState,
    showPasswordReveal,
    passwordPlaceholder,
    waitingForResult: Boolean(waitingForResult),
  } satisfies ParamUIRenderContext;

  const textLikeParam = renderTextLikeParam(renderContext);
  if (textLikeParam !== null) {
    return textLikeParam;
  }

  const dateTimeParam = renderDateTimeParam(renderContext);
  if (dateTimeParam !== null) {
    return dateTimeParam;
  }

  return renderSpecializedParam(renderContext);
}

function TextParamDateTimeConfigured({
  value,
  onChange,
  onEscape,
  isDisabled,
  uiType,
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
}: {
  value: string;
  onChange: ParamValueChange;
  onEscape: () => void;
  isDisabled: boolean;
  uiType: TextParamInputUIType;
  timeControlMode: TimeControlMode;
  timeDisplayFormat: TimeDisplayFormat;
  timeDisplayTransparent: boolean;
  timeDisplayScale: number;
  timeDisplayFont: TimeDisplayFont;
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
  dateIncludesTime: boolean;
}) {
  return (
    <TextParamDateTimeInput
      value={value}
      onChange={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
      uiType={uiType}
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
    />
  );
}

function SliderParamConfigured({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onCommit,
  onEscape,
  isDisabled,
}) {
  return (
    <ConfiguredSliderInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      onEscape={onEscape}
      isDisabled={isDisabled}
      wrapperDivClass={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} cursor-pointer @container/slider section-value flex gap-1`}
      sliderRootClassName=" data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5"
      sliderTrackClassName="relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700"
      sliderRangeClassName="absolute h-full rounded-full bg-blue-500"
      sliderThumbClassName={`${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} block h-3 w-3 cursor-pointer
      rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:!bg-setta-100 hover:dark:!bg-setta-700 focus-visible:!border-blue-500 focus-visible:bg-blue-500 focus-visible:dark:bg-blue-700 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600 data-[disabled]:pointer-events-none`}
      textInputClassName="hidden my-auto mr-[1px] h-5/6 w-8 cursor-auto resize-none rounded-lg border border-solid border-setta-300/20 bg-white px-2 text-center font-mono text-xs focus-visible:border-blue-300 dark:border-setta-875 dark:bg-setta-875 dark:text-setta-300 @[132px]/slider:block"
    />
  );
}

function RotaryParamConfigured({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onCommit,
  onEscape,
  isDisabled,
}: {
  sectionId: string;
  paramInfoId: string;
  value: string;
  onChange: ParamValueChange;
  onCommit?: ParamValueChange;
  onEscape: () => void;
  isDisabled: boolean;
}) {
  return (
    <ConfiguredRotaryInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      onEscape={onEscape}
      isDisabled={isDisabled}
    />
  );
}

function DropzoneParamConfigured({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onStatelessDrop,
  isDisabled,
  mode,
  maxAttachments,
  placeholder,
}: {
  sectionId: string;
  paramInfoId: string;
  value: string;
  onChange: ParamValueChange;
  onStatelessDrop?: (attachments: DropzoneStatelessAttachment[]) => void;
  isDisabled: boolean;
  mode: DropzoneModeEnum | null;
  maxAttachments: number | null;
  placeholder?: string;
}) {
  return (
    <DropzoneInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onStatelessDrop={onStatelessDrop}
      isDisabled={isDisabled}
      mode={mode ?? DropzoneModeEnum.STATEFUL}
      maxAttachments={maxAttachments}
      placeholder={placeholder}
    />
  );
}

function SwitchParamConfigured({
  value,
  defaultVal,
  onChange,
  onEscape,
  isDisabled,
}) {
  return (
    <SwitchInput
      value={value}
      defaultVal={defaultVal}
      onChange={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
      outerDivClassName="section-value flex justify-self-start self-center"
    />
  );
}

function ColorPickerParamConfigured({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onCommit,
  onEscape,
  isDisabled,
}: {
  sectionId: string;
  paramInfoId: string;
  value: string;
  onChange: ParamValueChange;
  onCommit?: ParamValueChange;
  onEscape: () => void;
  isDisabled: boolean;
}) {
  return (
    <ConfiguredColorPickerInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      onEscape={onEscape}
      wrapperClassName={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} section-value single-cell-container min-w-0 w-[calc(100%_-_2px)] justify-self-start self-center h-[calc(100%_-_4px)] min-h-0`}
      colorPickerChoicesClasses="flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-full min-h-0 w-full min-w-0 items-center text-white"
      isDisabled={isDisabled}
    />
  );
}

function DropdownParamConfigured({
  sectionId,
  paramInfoId,
  value,
  onChange,
  isDisabled,
}) {
  return (
    <ConfiguredDropdownInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      outerDivClasses={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} section-value flex justify-self-start self-center [&_search]:my-auto`}
      isDisabled={isDisabled}
    />
  );
}

function PasswordParamConfigured({
  value,
  onChange,
  onEscape,
  isDisabled,
  isSelectingParams,
  showReveal,
  onReveal,
  isRevealing,
  placeholder,
}) {
  const revealDisabled = isDisabled || isRevealing || !onReveal;
  const inputClassName = `${!isDisabled ? "cursor-text select-text" : ""} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} peer/textinput flex min-w-0 flex-1 self-center font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`;
  const revealClassName = `${revealDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex-none bg-transparent text-left font-mono text-xs text-setta-400 hover:text-setta-600 dark:text-setta-400 dark:hover:text-setta-300`;
  const wrapperClassName = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} section-value flex min-w-0 items-center gap-2`;
  return (
    <>
      <div className={wrapperClassName}>
        <PasswordInput
          className={inputClassName}
          value={value}
          onChange={onChange}
          onEscape={onEscape}
          isDisabled={isDisabled}
          placeholder={placeholder}
          toggleClassName="flex-none"
        />
        {showReveal ? (
          <button
            type="button"
            className={revealClassName}
            onClick={onReveal}
            disabled={revealDisabled}
            aria-busy={isRevealing}
            title="Reveal saved password"
          >
            {isRevealing ? "Revealing..." : "Reveal"}
          </button>
        ) : null}
      </div>
      <span
        className={`section-value grid-row-start-1 border-box self-end border-b border-setta-200/50 dark:border-setta-600/30 ${!isSelectingParams ? "peer-focus-within/textinput:border-blue-400" : ""}`}
      />
    </>
  );
}
