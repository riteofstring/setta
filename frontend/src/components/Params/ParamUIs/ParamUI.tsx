import {
  type SettingsAllSettingsBenchmarkNonTextWidgetScope,
  useSettingsAllSettingsBenchmark,
  type SettingsAllSettingsBenchmarkTextFamilyWidgetScope,
} from "components/Pages/Project/settingsAllSettingsBenchmark";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import _ from "lodash";
import {
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import { useMisc, useProjectState, useShareSession } from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import { useShareCapabilities } from "state/hooks/share";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
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
} from "utils/generatedTypes";
import { shouldShowPasswordReveal } from "utils/paramValue";
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
import { PasswordInput } from "./PasswordInput";
import { SliderInputConfigForParam } from "./SliderInput";
import { SwitchInput } from "./SwitchInput";
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
  onDropzoneStateless?: (attachments: DropzoneStatelessAttachment[]) => void;
  onRevealPassword?: () => void;
  isPasswordRevealPending?: boolean;
  maybeErrorMessage?: string;
};

type TextFamilyBenchmarkKind = "code" | "text" | "text-area";
type NonTextBenchmarkKind = "dropdown" | "switch" | "other";

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
  onDropzoneStateless,
  onRevealPassword,
  isPasswordRevealPending,
  maybeErrorMessage,
}: ParamUIProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const { canEditParams } = useShareCapabilities();
  const {
    codeObjType,
    passwordHasSecret,
    configLanguage,
    defaultVal,
    disabledOrFrozen,
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
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
    );
    const isDropzone = codeObjImpl.type === CodeObjTypeEnum.DropzoneParam;
    const hasPasswordSecret =
      codeObjImpl.type === CodeObjTypeEnum.PasswordParam
        ? codeObjImpl.hasSecret
        : false;
    const isDateParam = codeObjImpl.type === CodeObjTypeEnum.DateParam;
    const isTimeParam = codeObjImpl.type === CodeObjTypeEnum.TimeParam;
    return {
      codeObjType: codeObjImpl.type,
      passwordHasSecret: hasPasswordSecret,
      configLanguage: impl.configLanguage,
      defaultVal: codeObjImpl.defaultVal,
      disabledOrFrozen: impl.isFrozen,
      dropzoneMode: isDropzone ? codeObjImpl.mode : null,
      dropzoneMaxAttachments: isDropzone
        ? codeObjImpl.maxAttachments ?? null
        : null,
      dropzonePlaceholder: isDropzone ? codeObjImpl.placeholder : null,
      timeControlMode: isTimeParam
        ? codeObjImpl.timeControlMode
        : TimeControlModeEnum.display,
      timeDisplayFormat: isTimeParam
        ? codeObjImpl.timeDisplayFormat
        : TimeDisplayFormatEnum.twenty_four_hour,
      timeDisplayTransparent: isTimeParam
        ? codeObjImpl.timeDisplayTransparent
        : false,
      timeDisplayScale: isTimeParam ? codeObjImpl.timeDisplayScale : 1,
      timeDisplayFont: isTimeParam
        ? codeObjImpl.timeDisplayFont
        : TimeDisplayFontEnum.monospace,
      dateDisplayFormat: isDateParam
        ? codeObjImpl.dateDisplayFormat
        : DateDisplayFormatEnum.iso,
      dateControlMode: isDateParam
        ? codeObjImpl.dateControlMode
        : DateControlModeEnum.input,
      dateSelectionMode: isDateParam
        ? codeObjImpl.dateSelectionMode
        : DateSelectionModeEnum.single,
      dateCalendarWeekStart: isDateParam
        ? codeObjImpl.dateCalendarWeekStart
        : DateCalendarWeekStartEnum.sunday,
      dateIncludesTime: isDateParam ? codeObjImpl.dateIncludesTime : false,
    };
  }, _.isEqual);

  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId,
  });
  const isCodeParam = codeObjType === CodeObjTypeEnum.CodeParam;
  const isDisabled =
    isSelectingParams ||
    disabledOrFrozen ||
    !canEditParams ||
    (isDeploymentMode && isCodeParam);
  const showPasswordReveal =
    !isDeploymentMode &&
    shouldShowPasswordReveal({
      value,
      hasSecret: passwordHasSecret,
    });
  const passwordPlaceholder =
    passwordHasSecret && value === "" ? "Saved" : undefined;

  function onEscape() {
    focusOnSection(null, sectionId, false);
  }

  if (!benchmark.renderParamWidgets) {
    return <BenchmarkParamWidgetShell kind="param-ui-shell" />;
  }

  const textFamilyBenchmarkKind = getTextFamilyBenchmarkKind(codeObjType);
  if (
    textFamilyBenchmarkKind !== null &&
    !shouldRenderTextFamilyBenchmarkWidget(
      benchmark.textFamilyWidgetScope,
      textFamilyBenchmarkKind,
    )
  ) {
    return (
      <BenchmarkParamWidgetShell
        kind="text-family"
        textFamilyKind={textFamilyBenchmarkKind}
      />
    );
  }

  const nonTextBenchmarkKind = getNonTextBenchmarkKind(codeObjType);
  if (
    nonTextBenchmarkKind !== null &&
    !shouldRenderNonTextBenchmarkWidget(
      benchmark.nonTextWidgetScope ?? "all",
      nonTextBenchmarkKind,
    )
  ) {
    return (
      <BenchmarkParamWidgetShell
        kind="non-text-family"
        nonTextKind={nonTextBenchmarkKind}
      />
    );
  }

  // need to put the group/textinput in a higher div

  switch (codeObjType) {
    case CodeObjTypeEnum.CodeParam:
      return (
        <TextParamConfigured
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          onEscape={onEscape}
          maybeErrorMessage={maybeErrorMessage}
          isDisabled={isDisabled}
          configLanguage={configLanguage}
          waitingForResult={waitingForResult}
          isSelectingParams={isSelectingParams}
          benchmarkTextWidgetKind="code"
        />
      );
    case CodeObjTypeEnum.TextParam:
      return (
        <TextParamConfigured
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          onEscape={onEscape}
          maybeErrorMessage={maybeErrorMessage}
          isDisabled={isDisabled}
          configLanguage={configLanguage}
          waitingForResult={waitingForResult}
          isSelectingParams={isSelectingParams}
          benchmarkTextWidgetKind="text"
        />
      );
    case CodeObjTypeEnum.DateParam:
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
          dateDisplayFormat={dateDisplayFormat}
          dateControlMode={dateControlMode}
          dateSelectionMode={dateSelectionMode}
          dateCalendarWeekStart={dateCalendarWeekStart}
          dateIncludesTime={dateIncludesTime}
        />
      );
    case CodeObjTypeEnum.TimeParam:
      return (
        <TextParamDateTimeConfigured
          value={value}
          onChange={onChange}
          onEscape={onEscape}
          isDisabled={isDisabled}
          uiType={TextParamInputUITypeEnum.time}
          timeControlMode={timeControlMode}
          timeDisplayFormat={timeDisplayFormat}
          timeDisplayTransparent={timeDisplayTransparent}
          timeDisplayScale={timeDisplayScale}
          timeDisplayFont={timeDisplayFont}
          dateDisplayFormat={DateDisplayFormatEnum.iso}
          dateControlMode={DateControlModeEnum.input}
          dateSelectionMode={DateSelectionModeEnum.single}
          dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
          dateIncludesTime={false}
        />
      );
    case CodeObjTypeEnum.SliderParam:
      return (
        <SliderParamConfigured
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={onChange}
          onEscape={onEscape}
          isDisabled={isDisabled}
        />
      );
    case CodeObjTypeEnum.RotaryParam:
      return (
        <RotaryParamConfigured
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={onChange}
          onEscape={onEscape}
          isDisabled={isDisabled}
        />
      );
    case CodeObjTypeEnum.SwitchParam:
      return (
        <SwitchParamConfigured
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          onEscape={onEscape}
          isDisabled={isDisabled}
        />
      );
    case CodeObjTypeEnum.ColorPickerParam:
      return (
        <ColorPickerParamConfigured
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={onChange}
          onEscape={onEscape}
          isDisabled={isDisabled}
        />
      );
    case CodeObjTypeEnum.DropdownParam:
      return (
        <DropdownParamConfigured
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={onChange}
          isDisabled={isDisabled}
        />
      );
    case CodeObjTypeEnum.PasswordParam:
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
    case CodeObjTypeEnum.TextAreaParam:
      return (
        <TextParamConfigured
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          onEscape={onEscape}
          maybeErrorMessage={maybeErrorMessage}
          isDisabled={isDisabled}
          configLanguage={configLanguage}
          waitingForResult={waitingForResult}
          isSelectingParams={isSelectingParams}
          benchmarkTextWidgetKind="text-area"
        />
      );
    case CodeObjTypeEnum.DropzoneParam:
      return (
        <DropzoneParamConfigured
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={onChange}
          onStatelessDrop={onDropzoneStateless}
          isDisabled={isDisabled}
          mode={dropzoneMode}
          maxAttachments={dropzoneMaxAttachments}
          placeholder={dropzonePlaceholder ?? undefined}
        />
      );
    default:
      return codeObjType satisfies never;
  }
}

function getTextFamilyBenchmarkKind(
  codeObjType: CodeObjTypeEnum,
): TextFamilyBenchmarkKind | null {
  switch (codeObjType) {
    case CodeObjTypeEnum.CodeParam:
      return "code";
    case CodeObjTypeEnum.TextParam:
      return "text";
    case CodeObjTypeEnum.TextAreaParam:
      return "text-area";
    default:
      return null;
  }
}

function getNonTextBenchmarkKind(
  codeObjType: CodeObjTypeEnum,
): NonTextBenchmarkKind | null {
  switch (codeObjType) {
    case CodeObjTypeEnum.CodeParam:
    case CodeObjTypeEnum.TextParam:
    case CodeObjTypeEnum.TextAreaParam:
      return null;
    case CodeObjTypeEnum.DropdownParam:
      return "dropdown";
    case CodeObjTypeEnum.SwitchParam:
      return "switch";
    case CodeObjTypeEnum.DateParam:
    case CodeObjTypeEnum.TimeParam:
    case CodeObjTypeEnum.SliderParam:
    case CodeObjTypeEnum.RotaryParam:
    case CodeObjTypeEnum.ColorPickerParam:
    case CodeObjTypeEnum.ButtonParam:
    case CodeObjTypeEnum.PasswordParam:
    case CodeObjTypeEnum.DropzoneParam:
      return "other";
    default:
      return codeObjType satisfies never;
  }
}

function shouldRenderTextFamilyBenchmarkWidget(
  scope: SettingsAllSettingsBenchmarkTextFamilyWidgetScope,
  kind: TextFamilyBenchmarkKind,
) {
  switch (scope) {
    case "all":
      return true;
    case "none":
      return false;
    case "code-only":
      return kind === "code";
    case "text-only":
      return kind === "text";
    case "text-area-only":
      return kind === "text-area";
    default:
      return scope satisfies never;
  }
}

function shouldRenderNonTextBenchmarkWidget(
  scope: SettingsAllSettingsBenchmarkNonTextWidgetScope,
  kind: NonTextBenchmarkKind,
) {
  switch (scope) {
    case "all":
      return true;
    case "dropdown-only":
      return kind === "dropdown";
    case "switch-only":
      return kind === "switch";
    case "other-only":
      return kind === "other";
    case "all-except-dropdown":
      return kind !== "dropdown";
    default:
      return scope satisfies never;
  }
}

function BenchmarkParamWidgetShell({
  kind,
  textFamilyKind,
  nonTextKind,
}: {
  kind: "param-ui-shell" | "text-family" | "non-text-family";
  textFamilyKind?: TextFamilyBenchmarkKind;
  nonTextKind?: NonTextBenchmarkKind;
}) {
  const label =
    kind === "param-ui-shell"
      ? "Input shell"
      : kind === "text-family"
        ? `${textFamilyKind ?? "text"} widget disabled`
        : `${nonTextKind ?? "other"} widget disabled`;

  return (
    <div
      className="section-key-value flex min-w-0 items-center rounded-sm border border-dashed border-setta-200/80 px-2 py-[0.2rem] text-[0.58rem] uppercase tracking-[0.14em] text-setta-400 dark:border-setta-700 dark:text-setta-500"
      data-settings-benchmark-widget-shell={kind}
      data-settings-benchmark-text-widget-shell-kind={
        kind === "text-family" ? textFamilyKind : undefined
      }
      data-settings-benchmark-non-text-widget-shell-kind={
        kind === "non-text-family" ? nonTextKind : undefined
      }
    >
      {label}
    </div>
  );
}

function TextParamConfigured({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  onEscape,
  maybeErrorMessage,
  isDisabled,
  configLanguage,
  waitingForResult,
  isSelectingParams,
  benchmarkTextWidgetKind,
}: {
  sectionId: string;
  paramInfoId: string;
  value: string;
  defaultVal: string;
  onChange: ParamValueChange;
  onEscape: () => void;
  maybeErrorMessage: string | undefined;
  isDisabled: boolean;
  configLanguage: string;
  waitingForResult: boolean;
  isSelectingParams: boolean;
  benchmarkTextWidgetKind: TextFamilyBenchmarkKind;
}) {
  return (
    <>
      <TextInputCodeMirror
        dummyDivId={`${sectionId}-${paramInfoId}-ParamInput`}
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={value}
        defaultVal={defaultVal}
        onChange={onChange}
        onEscape={(completionResult) => {
          if (!completionResult) {
            onEscape();
          }
        }}
        dummyCodeClassName={`${NO_PAN_CLASS_NAME} section-value self-end peer/textinput ${maybeErrorMessage ? "[&_*]:!text-red-500" : ""} nodrag ${!isDisabled ? "cursor-text select-text" : ""} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`}
        realCodeClassName={`${NO_PAN_CLASS_NAME} nodrag self-end peer/textinput ${maybeErrorMessage ? "[&_*]:!text-red-500" : ""} [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`}
        language={configLanguage}
        isDisabled={isDisabled}
        tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
        benchmarkTextWidgetKind={benchmarkTextWidgetKind}
      />
      {waitingForResult && (
        <i className="section-value gg-spinner self-center justify-self-end text-blue-500/70" />
      )}
      <span
        className={`section-value grid-row-start-1 border-box self-end border-b border-setta-200/50 dark:border-setta-600/30 ${!isSelectingParams ? "peer-focus-within/textinput:border-blue-400" : ""}`}
      />
    </>
  );
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
  onEscape,
  isDisabled,
}) {
  return (
    <ConfiguredSliderInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
      wrapperDivClass={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} cursor-pointer @container/slider section-value flex gap-1`}
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
  onEscape,
  isDisabled,
}: {
  sectionId: string;
  paramInfoId: string;
  value: string;
  onChange: ParamValueChange;
  onEscape: () => void;
  isDisabled: boolean;
}) {
  return (
    <ConfiguredRotaryInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
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
  onEscape,
  isDisabled,
}) {
  return (
    <ConfiguredColorPickerInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onEscape={onEscape}
      wrapperClassName="section-value single-cell-container min-w-0 w-[calc(100%_-_2px)] justify-self-start self-center h-[calc(100%_-_4px)] min-h-0"
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
      outerDivClasses="section-value flex justify-self-start self-center [&_search]:my-auto"
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
  const inputClassName = `${!isDisabled ? "cursor-text select-text" : ""} nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`;
  const revealClassName = `${revealDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} nodrag flex-none bg-transparent text-left font-mono text-xs text-setta-400 hover:text-setta-600 dark:text-setta-500 dark:hover:text-setta-300`;
  const wrapperClassName = "section-value flex min-w-0 items-center gap-2";
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
