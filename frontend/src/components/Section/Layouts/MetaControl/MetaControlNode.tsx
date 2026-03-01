import {
  ConfiguredButtonInput,
  ConfiguredColorPickerInput,
  ConfiguredDropdownInput,
  ConfiguredRotaryInput,
  ConfiguredSliderInput,
  ParamValueChange,
} from "components/Params/ParamUIs/ConfiguredParamInputs";
import { DropzoneInput } from "components/Params/ParamUIs/DropzoneInput";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { TextParamDateTimeInput } from "components/Params/ParamUIs/TextParamInput";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import type { ReactNode } from "react";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
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
} from "utils/generatedTypes";

type MetaControlCodeObjType =
  | CodeObjTypeEnum.ButtonParam
  | CodeObjTypeEnum.CodeParam
  | CodeObjTypeEnum.ColorPickerParam
  | CodeObjTypeEnum.DropdownParam
  | CodeObjTypeEnum.DropzoneParam
  | CodeObjTypeEnum.PasswordParam
  | CodeObjTypeEnum.RotaryParam
  | CodeObjTypeEnum.SliderParam
  | CodeObjTypeEnum.SwitchParam
  | CodeObjTypeEnum.TextAreaParam
  | CodeObjTypeEnum.TextParam
  | CodeObjTypeEnum.DateParam
  | CodeObjTypeEnum.TimeParam;

type MetaControlContentButtonProps = {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  paramDisplayName: string;
  codeObjType: CodeObjTypeEnum.ButtonParam;
  showSectionTitle: boolean;
  onAction: () => void;
};

type MetaControlContentValueProps = {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  paramDisplayName: string;
  codeObjType: Exclude<MetaControlCodeObjType, CodeObjTypeEnum.ButtonParam>;
  value: string;
  defaultVal: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
  dropzoneMode?: DropzoneModeEnum;
  dropzoneMaxAttachments?: number | null;
  dropzonePlaceholder?: string;
  onDropzoneStateless?: (attachments: DropzoneStatelessAttachment[]) => void;
  timeControlMode?: TimeControlMode;
  timeDisplayFormat?: TimeDisplayFormat;
  timeDisplayTransparent?: boolean;
  timeDisplayScale?: number;
  timeDisplayFont?: TimeDisplayFont;
  dateDisplayFormat?: DateDisplayFormat;
  dateControlMode?: DateControlMode;
  dateSelectionMode?: DateSelectionMode;
  dateCalendarWeekStart?: DateCalendarWeekStart;
  dateIncludesTime?: boolean;
};

type MetaControlContentProps =
  | MetaControlContentButtonProps
  | MetaControlContentValueProps;

export function MetaControlContent(props: MetaControlContentProps) {
  if (props.codeObjType === CodeObjTypeEnum.ButtonParam) {
    return (
      <ButtonControl
        sectionId={props.sectionId}
        controlParamId={props.controlParamId}
        sectionName={props.sectionName}
        showSectionTitle={props.showSectionTitle}
        onAction={props.onAction}
      />
    );
  }

  const {
    sectionId,
    controlParamId,
    codeObjType,
    sectionName,
    paramDisplayName,
    value,
    defaultVal,
    onValueChange,
    showSectionTitle,
  } = props;

  switch (codeObjType) {
    case CodeObjTypeEnum.CodeParam:
      return (
        <TextInputControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          value={value}
          defaultVal={defaultVal}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
          language="python"
          singleLine={false}
        />
      );
    case CodeObjTypeEnum.TextParam:
      return (
        <TextInputControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          value={value}
          defaultVal={defaultVal}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
          language="python"
          singleLine={false}
        />
      );
    case CodeObjTypeEnum.TextAreaParam:
      return (
        <TextInputControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          value={value}
          defaultVal={defaultVal}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
          language="python"
          singleLine={false}
          minHeightClassName="min-h-24"
        />
      );
    case CodeObjTypeEnum.DateParam:
      return (
        <DateTimeControl
          sectionName={sectionName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
          uiType={TextParamInputUITypeEnum.date}
          timeControlMode={TimeControlModeEnum.display}
          timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
          timeDisplayTransparent={false}
          timeDisplayScale={1}
          timeDisplayFont={TimeDisplayFontEnum.monospace}
          dateDisplayFormat={
            props.dateDisplayFormat ?? DateDisplayFormatEnum.iso
          }
          dateControlMode={props.dateControlMode ?? DateControlModeEnum.input}
          dateSelectionMode={
            props.dateSelectionMode ?? DateSelectionModeEnum.single
          }
          dateCalendarWeekStart={
            props.dateCalendarWeekStart ?? DateCalendarWeekStartEnum.sunday
          }
          dateIncludesTime={props.dateIncludesTime ?? false}
        />
      );
    case CodeObjTypeEnum.TimeParam:
      return (
        <DateTimeControl
          sectionName={sectionName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
          uiType={TextParamInputUITypeEnum.time}
          timeControlMode={props.timeControlMode ?? TimeControlModeEnum.display}
          timeDisplayFormat={
            props.timeDisplayFormat ?? TimeDisplayFormatEnum.twenty_four_hour
          }
          timeDisplayTransparent={props.timeDisplayTransparent ?? false}
          timeDisplayScale={props.timeDisplayScale ?? 1}
          timeDisplayFont={
            props.timeDisplayFont ?? TimeDisplayFontEnum.monospace
          }
          dateDisplayFormat={DateDisplayFormatEnum.iso}
          dateControlMode={DateControlModeEnum.input}
          dateSelectionMode={DateSelectionModeEnum.single}
          dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
          dateIncludesTime={false}
        />
      );
    case CodeObjTypeEnum.SliderParam:
      return (
        <SliderControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.RotaryParam:
      return (
        <RotaryControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.SwitchParam:
      return (
        <SwitchControl
          sectionName={sectionName}
          controlLabel={paramDisplayName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.ColorPickerParam:
      return (
        <ColorControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.DropdownParam:
      return (
        <DropdownControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.PasswordParam:
      return (
        <PasswordControl
          sectionName={sectionName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.DropzoneParam:
      return (
        <DropzoneControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          sectionName={sectionName}
          value={value}
          showSectionTitle={showSectionTitle}
          onValueChange={onValueChange}
          mode={props.dropzoneMode ?? DropzoneModeEnum.STATEFUL}
          maxAttachments={props.dropzoneMaxAttachments ?? null}
          placeholder={props.dropzonePlaceholder}
          onStatelessDrop={props.onDropzoneStateless}
        />
      );
    default:
      return null;
  }
}

function ButtonControl({
  sectionId,
  controlParamId,
  sectionName,
  showSectionTitle,
  onAction,
}: {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  showSectionTitle: boolean;
  onAction: () => void;
}) {
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <ConfiguredButtonInput
        sectionId={sectionId}
        paramInfoId={controlParamId}
        onClick={onAction}
        wrapperClassName="flex h-full w-full items-stretch"
        buttonClassName={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex h-full min-h-8 w-full items-center justify-center rounded-lg border border-setta-600 bg-setta-600 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:border-setta-700 hover:bg-setta-700 active:translate-y-[2px] active:scale-[0.96] active:bg-setta-700 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-setta-500 dark:bg-setta-700 dark:text-setta-50 dark:hover:border-setta-400 dark:hover:bg-setta-600 dark:active:bg-setta-600 cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60`}
      />
    </MetaControlTitleStack>
  );
}

function TextInputControl({
  sectionId,
  controlParamId,
  sectionName,
  value,
  defaultVal,
  showSectionTitle,
  onValueChange,
  language,
  singleLine,
  minHeightClassName,
}: {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  value: string;
  defaultVal: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
  language: "python" | "markdown";
  singleLine: boolean;
  minHeightClassName?: string;
}) {
  const wrapperClassName = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-container h-full min-h-0 w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 text-[11px] font-mono text-setta-700 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-200`;
  const sizeClassName = minHeightClassName ? ` ${minHeightClassName}` : "";
  const inputClassName = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4] cursor-text select-text${sizeClassName}`;
  const realInputClassName = `${inputClassName} [&_*]:!outline-0 [&_.cm-content]:!px-0 [&_.cm-content]:!py-0 [&_.cm-line]:!px-0`;
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <div className={wrapperClassName}>
        <TextInputCodeMirror
          dummyDivId={`${sectionId}-${controlParamId}-MetaControl`}
          sectionId={sectionId}
          paramInfoId={controlParamId}
          value={value}
          defaultVal={defaultVal}
          onChange={onValueChange}
          dummyCodeClassName={inputClassName}
          realCodeClassName={realInputClassName}
          language={language}
          singleLine={singleLine}
          autocomplete={false}
          tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
        />
      </div>
    </MetaControlTitleStack>
  );
}

function SliderControl({
  sectionId,
  controlParamId,
  sectionName,
  value,
  showSectionTitle,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  value: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
}) {
  const sliderRootClassName = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full flex-1 touch-none select-none items-center data-[orientation='horizontal']:h-5 cursor-pointer`;
  const sliderTrackClassName = `${NO_DRAG_CLASS_NAME} relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700 cursor-pointer`;
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName = `${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} ${NO_DRAG_CLASS_NAME} block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm hover:!bg-setta-100 dark:border-setta-400 dark:bg-setta-600`;

  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-center"
    >
      <ConfiguredSliderInput
        sectionId={sectionId}
        paramInfoId={controlParamId}
        value={value}
        onChange={onValueChange}
        wrapperDivClass={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex w-full min-w-0 items-center gap-2 cursor-pointer`}
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName="hidden"
      />
    </MetaControlTitleStack>
  );
}

function RotaryControl({
  sectionId,
  controlParamId,
  sectionName,
  value,
  showSectionTitle,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  value: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
}) {
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-center"
    >
      <div
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex w-full items-center justify-center`}
      >
        <ConfiguredRotaryInput
          sectionId={sectionId}
          paramInfoId={controlParamId}
          value={value}
          onChange={onValueChange}
        />
      </div>
    </MetaControlTitleStack>
  );
}

function SwitchControl({
  sectionName,
  controlLabel,
  value,
  showSectionTitle,
  onValueChange,
}: {
  sectionName: string;
  controlLabel: string;
  value: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
}) {
  const trimmedLabel = controlLabel.trim();
  const showControlLabel = trimmedLabel.length > 0;

  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      containerClassName="@container/meta-switch"
      titleClassName="hidden @[140px]/meta-switch:block"
      contentClassName="items-center justify-between gap-3"
    >
      {showControlLabel && (
        <span
          className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} min-w-0 truncate text-xs font-semibold text-setta-700 dark:text-setta-300`}
        >
          {trimmedLabel}
        </span>
      )}
      <SwitchInput
        value={value}
        onChange={onValueChange}
        rootClassName={`${NO_DRAG_CLASS_NAME} section-value justify-self-start self-center`}
      />
    </MetaControlTitleStack>
  );
}

function ColorControl({
  sectionId,
  controlParamId,
  sectionName,
  value,
  showSectionTitle,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  value: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
}) {
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <ConfiguredColorPickerInput
        sectionId={sectionId}
        paramInfoId={controlParamId}
        value={value}
        onChange={onValueChange}
        wrapperClassName={`${NO_DRAG_CLASS_NAME} section-value single-cell-container min-w-0 w-[calc(100%_-_2px)] justify-self-start self-center h-[calc(100%_-_4px)] min-h-0`}
        colorPickerChoicesClasses="flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-full min-h-0 w-full min-w-0 items-center text-white"
      />
    </MetaControlTitleStack>
  );
}

function DropdownControl({
  sectionId,
  controlParamId,
  sectionName,
  value,
  showSectionTitle,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  value: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
}) {
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-center"
    >
      <ConfiguredDropdownInput
        sectionId={sectionId}
        paramInfoId={controlParamId}
        value={value}
        onChange={onValueChange}
        outerDivClasses={`${NO_DRAG_CLASS_NAME} section-value flex w-full justify-self-start self-center`}
        inputOuterClasses="!mx-0"
        placeholder="Choose"
      />
    </MetaControlTitleStack>
  );
}

function PasswordControl({
  sectionName,
  value,
  showSectionTitle,
  onValueChange,
}: {
  sectionName: string;
  value: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
}) {
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <div className="single-cell-container grid h-full min-h-0 w-full grid-cols-[1fr,auto]">
        <PasswordInput
          className={`${NO_DRAG_CLASS_NAME} single-cell-child flex h-full w-full min-w-0 max-w-[calc(100%_-_1.1rem)] cursor-text select-text self-center justify-self-start font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`}
          value={value}
          onChange={onValueChange}
          gridArea="single-cell-child"
        />
        <span className="single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 dark:border-setta-600/30" />
      </div>
    </MetaControlTitleStack>
  );
}

function DropzoneControl({
  sectionId,
  controlParamId,
  sectionName,
  value,
  showSectionTitle,
  onValueChange,
  mode,
  maxAttachments,
  placeholder,
  onStatelessDrop,
}: {
  sectionId: string;
  controlParamId: string;
  sectionName: string;
  value: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
  mode: DropzoneModeEnum;
  maxAttachments: number | null;
  placeholder?: string;
  onStatelessDrop?: (attachments: DropzoneStatelessAttachment[]) => void;
}) {
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <DropzoneInput
        sectionId={sectionId}
        paramInfoId={controlParamId}
        value={value}
        onChange={onValueChange}
        onStatelessDrop={onStatelessDrop}
        mode={mode}
        maxAttachments={maxAttachments}
        placeholder={placeholder}
      />
    </MetaControlTitleStack>
  );
}

function DateTimeControl({
  sectionName,
  value,
  showSectionTitle,
  onValueChange,
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
  sectionName: string;
  value: string;
  showSectionTitle: boolean;
  onValueChange: ParamValueChange;
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
  const isTimeDisplayMode =
    uiType === TextParamInputUITypeEnum.time &&
    timeControlMode === TimeControlModeEnum.display;
  const containerClassName =
    isTimeDisplayMode && timeDisplayTransparent
      ? "single-cell-container grid h-full min-h-0 w-full grid-cols-[1fr,auto] rounded-lg border border-transparent bg-transparent px-3 py-2"
      : "single-cell-container grid h-full min-h-0 w-full grid-cols-[1fr,auto] rounded-lg border border-setta-300/70 bg-setta-50 px-3 py-2 dark:border-setta-700 dark:bg-setta-850";

  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <div className={containerClassName}>
        <TextParamDateTimeInput
          value={value}
          onChange={onValueChange}
          isDisabled={false}
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
          wrapperClassName={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} section-value single-cell-child flex min-w-0 items-center gap-2`}
          inputClassName={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} peer/textinput flex min-w-0 flex-1 cursor-text self-center text-xs text-[rgb(3,_47,_98);] selection:bg-blue-500/30 dark:text-[rgb(165,_214,_255)]`}
          formattedValueClassName="text-[10px] font-mono text-setta-500 dark:text-setta-400"
          borderClassName="single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 dark:border-setta-600/30 peer-focus-within/textinput:border-blue-400"
        />
      </div>
    </MetaControlTitleStack>
  );
}

function MetaControlTitleStack({
  showSectionTitle,
  sectionName,
  children,
  containerClassName,
  contentClassName,
  titleClassName,
}: {
  showSectionTitle: boolean;
  sectionName: string;
  children: ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  titleClassName?: string;
}) {
  const showTitle = showSectionTitle && sectionName.trim().length > 0;
  const baseContainerClassName = "relative h-full w-full min-h-0 min-w-0";
  const containerClassNameToUse = `${baseContainerClassName} ${
    containerClassName ?? ""
  }`;
  const contentClassNameToUse = `flex h-full w-full min-h-0 min-w-0 ${
    contentClassName ?? ""
  }`;

  return (
    <div className={containerClassNameToUse}>
      {showTitle && (
        <span
          className={`pointer-events-none absolute left-0 top-0 z-10 -translate-y-full truncate text-[10px] uppercase tracking-[0.2em] text-setta-500 dark:text-setta-400 ${
            titleClassName ?? ""
          }`}
        >
          {sectionName}
        </span>
      )}
      <div className={contentClassNameToUse}>{children}</div>
    </div>
  );
}
