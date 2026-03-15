import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { DropdownInput } from "components/Params/ParamUIs/DropdownInput";
import { DropzoneInput } from "components/Params/ParamUIs/DropzoneInput";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { RotaryInput } from "components/Params/ParamUIs/RotaryInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { TextParamDateTimeInput } from "components/Params/ParamUIs/TextParamInput";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import _ from "lodash";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import type {
  BaseChildlessCodeObjImplUnion,
  BaseSectionImplUnion,
  DateParamCodeObjImpl,
  TimeParamCodeObjImpl,
} from "utils/generatedTypes";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  DropzoneModeEnum,
  isBaseSectionWithParamsImpl,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { shouldShowPasswordReveal } from "utils/paramValue";

type AppParamUIProps = {
  sectionId: string;
  paramInfoId: string;
  value: string | number | boolean | null;
  onChange: (
    value: string | number | boolean | null,
    options?: { skipBackendUpdate?: boolean },
  ) => void;
  onDropzoneStateless?: (attachments: DropzoneStatelessAttachment[]) => void;
  onRevealPassword?: () => void;
  isPasswordRevealPending?: boolean;
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  sectionImpl: BaseSectionImplUnion;
  canEditParams: boolean;
};

export function AppParamUI({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onDropzoneStateless,
  onRevealPassword,
  isPasswordRevealPending,
  codeObjImpl,
  sectionImpl,
  canEditParams,
}: AppParamUIProps) {
  const codeObjType = codeObjImpl.type;
  const configLanguage = isBaseSectionWithParamsImpl(sectionImpl)
    ? sectionImpl.configLanguage ?? ConfigLanguageEnum.python
    : ConfigLanguageEnum.python;
  const isFrozen = isBaseSectionWithParamsImpl(sectionImpl)
    ? sectionImpl.isFrozen
    : false;
  const defaultVal =
    "defaultVal" in codeObjImpl ? codeObjImpl.defaultVal : null;
  const isDisabled = !canEditParams || isFrozen;
  const isPasswordParam = codeObjType === CodeObjTypeEnum.PasswordParam;
  const passwordHasSecret =
    isPasswordParam && "hasSecret" in codeObjImpl
      ? codeObjImpl.hasSecret
      : false;
  const stringValue = _.toString(value ?? "");
  const showPasswordReveal = shouldShowPasswordReveal({
    value: stringValue,
    hasSecret: passwordHasSecret,
  });
  const passwordPlaceholder =
    passwordHasSecret && stringValue === "" ? "Saved" : undefined;

  const onEscape = () => {};

  const getDateParamImpl = (): DateParamCodeObjImpl => {
    if (codeObjImpl.type !== CodeObjTypeEnum.DateParam) {
      throw new TypeError(
        `Expected DateParam impl, got ${codeObjImpl.type ?? "unknown"}.`,
      );
    }
    return codeObjImpl;
  };

  const getTimeParamImpl = (): TimeParamCodeObjImpl => {
    if (codeObjImpl.type !== CodeObjTypeEnum.TimeParam) {
      throw new TypeError(
        `Expected TimeParam impl, got ${codeObjImpl.type ?? "unknown"}.`,
      );
    }
    return codeObjImpl;
  };

  switch (codeObjType) {
    case CodeObjTypeEnum.CodeParam:
    case CodeObjTypeEnum.TextAreaParam: {
      return (
        <>
          <TextInputCodeMirror
            dummyDivId={`${sectionId}-${paramInfoId}-ParamInput`}
            sectionId={sectionId}
            paramInfoId={paramInfoId}
            value={stringValue}
            defaultVal={_.toString(defaultVal ?? "")}
            onChange={onChange}
            onEscape={(completionResult) => {
              if (!completionResult) {
                onEscape();
              }
            }}
            dummyCodeClassName={`${NO_PAN_CLASS_NAME} section-value self-end peer/textinput nodrag ${!isDisabled ? "cursor-text select-text" : ""} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`}
            realCodeClassName={`${NO_PAN_CLASS_NAME} nodrag self-end peer/textinput [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-[color:var(--app-surface-alt)] [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`}
            language={configLanguage}
            isDisabled={isDisabled}
            tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
            autocomplete={false}
          />
          <span className="section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]" />
        </>
      );
    }
    case CodeObjTypeEnum.TextParam: {
      return (
        <>
          <TextInputCodeMirror
            dummyDivId={`${sectionId}-${paramInfoId}-ParamInput`}
            sectionId={sectionId}
            paramInfoId={paramInfoId}
            value={stringValue}
            defaultVal={_.toString(defaultVal ?? "")}
            onChange={onChange}
            onEscape={(completionResult) => {
              if (!completionResult) {
                onEscape();
              }
            }}
            dummyCodeClassName={`${NO_PAN_CLASS_NAME} section-value self-end peer/textinput nodrag ${!isDisabled ? "cursor-text select-text" : ""} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`}
            realCodeClassName={`${NO_PAN_CLASS_NAME} nodrag self-end peer/textinput [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-[color:var(--app-surface-alt)] [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`}
            language={configLanguage}
            isDisabled={isDisabled}
            tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
            autocomplete={false}
          />
          <span className="section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]" />
        </>
      );
    }
    case CodeObjTypeEnum.TimeParam: {
      const timeParamImpl = getTimeParamImpl();
      return (
        <TextParamDateTimeInput
          value={stringValue}
          onChange={onChange}
          onEscape={onEscape}
          isDisabled={isDisabled}
          uiType={TextParamInputUITypeEnum.time}
          timeControlMode={timeParamImpl.timeControlMode}
          timeDisplayFormat={timeParamImpl.timeDisplayFormat}
          timeDisplayTransparent={timeParamImpl.timeDisplayTransparent}
          timeDisplayScale={timeParamImpl.timeDisplayScale}
          timeDisplayFont={timeParamImpl.timeDisplayFont}
          dateDisplayFormat={DateDisplayFormatEnum.iso}
          dateControlMode={DateControlModeEnum.input}
          dateSelectionMode={DateSelectionModeEnum.single}
          dateCalendarWeekStart={DateCalendarWeekStartEnum.sunday}
          dateIncludesTime={false}
          inputClassName={`${!isDisabled ? "cursor-text select-text" : ""} nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-text)]`}
          formattedValueClassName="text-[10px] font-mono text-[color:var(--app-muted)]"
          borderClassName="section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]"
        />
      );
    }
    case CodeObjTypeEnum.DateParam: {
      const dateParamImpl = getDateParamImpl();
      return (
        <TextParamDateTimeInput
          value={stringValue}
          onChange={onChange}
          onEscape={onEscape}
          isDisabled={isDisabled}
          uiType={TextParamInputUITypeEnum.date}
          timeControlMode={TimeControlModeEnum.display}
          timeDisplayFormat={TimeDisplayFormatEnum.twenty_four_hour}
          timeDisplayTransparent={false}
          timeDisplayScale={1}
          timeDisplayFont={TimeDisplayFontEnum.monospace}
          dateDisplayFormat={dateParamImpl.dateDisplayFormat}
          dateControlMode={dateParamImpl.dateControlMode}
          dateSelectionMode={dateParamImpl.dateSelectionMode}
          dateCalendarWeekStart={dateParamImpl.dateCalendarWeekStart}
          dateIncludesTime={dateParamImpl.dateIncludesTime}
          inputClassName={`${!isDisabled ? "cursor-text select-text" : ""} nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-text)]`}
          formattedValueClassName="text-[10px] font-mono text-[color:var(--app-muted)]"
          borderClassName="section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]"
        />
      );
    }
    case CodeObjTypeEnum.SliderParam: {
      const min = "min" in codeObjImpl ? codeObjImpl.min ?? 0 : 0;
      const max = "max" in codeObjImpl ? codeObjImpl.max ?? 100 : 100;
      const step = "step" in codeObjImpl ? codeObjImpl.step ?? 1 : 1;
      const numericValue = _.toNumber(value);
      const resolvedValue = Number.isFinite(numericValue) ? numericValue : min;
      return (
        <SliderInput
          value={resolvedValue}
          onChange={(nextValue: number) => onChange(nextValue)}
          onEscape={onEscape}
          min={min}
          max={max}
          step={step}
          isDisabled={isDisabled}
          wrapperDivClass={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} cursor-pointer @container/slider section-value flex gap-1`}
          sliderRootClassName=" data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5"
          sliderTrackClassName="relative flex-grow rounded-full bg-[color:var(--app-surface-alt)] data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px]"
          sliderRangeClassName="absolute h-full rounded-full bg-[color:var(--app-accent)]"
          sliderThumbClassName={`${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} block h-3 w-3 cursor-pointer rounded-full border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface)] shadow-sm drop-shadow-md hover:!bg-[color:var(--app-surface-alt)] focus-visible:!border-[color:var(--app-accent)] focus-visible:bg-[color:var(--app-accent)] focus-visible:outline-none data-[disabled]:pointer-events-none`}
          textInputClassName="hidden my-auto mr-[1px] h-5/6 w-8 cursor-auto resize-none rounded-lg border border-solid border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-2 text-center font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-text)] focus-visible:border-[color:var(--app-accent)] @[132px]/slider:block"
        />
      );
    }
    case CodeObjTypeEnum.RotaryParam: {
      const min = "min" in codeObjImpl ? codeObjImpl.min ?? 0 : 0;
      const max = "max" in codeObjImpl ? codeObjImpl.max ?? 100 : 100;
      const step = "step" in codeObjImpl ? codeObjImpl.step ?? 1 : 1;
      const numericValue = _.toNumber(value);
      const resolvedValue = Number.isFinite(numericValue) ? numericValue : min;
      return (
        <RotaryInput
          value={resolvedValue}
          onChange={(nextValue: number) => onChange(nextValue)}
          onEscape={onEscape}
          min={min}
          max={max}
          step={step}
          isDisabled={isDisabled}
          indicatorThemeClassName="bg-[color:var(--app-accent)]"
        />
      );
    }
    case CodeObjTypeEnum.SwitchParam: {
      return (
        <SwitchInput
          value={value ?? false}
          defaultVal={defaultVal ?? undefined}
          onChange={(nextValue: boolean) => onChange(nextValue)}
          onEscape={onEscape}
          isDisabled={isDisabled}
          outerDivClassName="section-value flex justify-self-start self-center"
          rootThemeClassName="bg-[color:var(--app-surface-alt)] data-[state='checked']:bg-[color:var(--app-accent)] focus-visible:ring-[color:var(--app-accent)]"
          thumbThemeClassName="bg-[color:var(--app-surface)]"
        />
      );
    }
    case CodeObjTypeEnum.ColorPickerParam: {
      const colorChoices =
        "colorChoices" in codeObjImpl ? codeObjImpl.colorChoices : [];
      return (
        <ColorPickerInput
          colorChoices={colorChoices}
          value={stringValue}
          onChange={onChange}
          onEscape={onEscape}
          wrapperClassName="section-value single-cell-container min-w-0 w-[calc(100%_-_2px)] justify-self-start self-center h-[calc(100%_-_4px)] min-h-0"
          colorPickerChoicesClasses="flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-full min-h-0 w-full min-w-0 items-center"
          isDisabled={isDisabled}
          theme={{
            inputBorderClassName: "!border-[color:var(--app-border)]",
            triggerBorderClassName: "!border-[color:var(--app-border)]",
            menuContentClassName:
              "z-20 flex flex-col rounded border border-[color:var(--app-dropdown-border)] bg-[color:var(--app-dropdown-bg)] p-2 text-[color:var(--app-dropdown-text)] shadow-xl",
            menuItemClassName:
              "flex cursor-pointer items-center rounded px-2 py-1 hover:bg-[color:var(--app-input-bg-hover)]",
            menuItemTextClassName:
              "max-w-48 truncate [font-size:var(--app-text-xs)] text-[color:var(--app-dropdown-text)]",
          }}
        />
      );
    }
    case CodeObjTypeEnum.DropdownParam: {
      const choices = "choices" in codeObjImpl ? codeObjImpl.choices : [];
      let dropdownValue: string | null = null;
      if (typeof value === "string") {
        dropdownValue = value;
      } else if (value !== null && value !== undefined) {
        dropdownValue = stringValue;
      }
      return (
        <DropdownInput
          choices={choices}
          value={dropdownValue}
          onChange={onChange}
          outerDivClasses="section-value flex justify-self-start self-center [&_search]:my-auto"
          comboboxInputThemeClassName="!bg-[color:var(--app-input-bg)] hover:!bg-[color:var(--app-input-bg-hover)] !border-[color:var(--app-input-border)] !text-[color:var(--app-input-text)] !placeholder:text-[color:var(--app-input-placeholder)] focus:!border-[color:var(--app-input-focus-border)] focus-visible:!ring-[color:var(--app-input-ring)]"
          comboboxRightButtonThemeClassName="!text-[color:var(--app-dropdown-muted)] hover:!bg-[color:var(--app-input-bg-hover)] hover:!text-[color:var(--app-dropdown-text)] dark:!text-[color:var(--app-dropdown-muted)] dark:hover:!bg-[color:var(--app-input-bg-hover)] dark:hover:!text-[color:var(--app-dropdown-text)]"
          comboboxListThemeClassName="!border-[color:var(--app-dropdown-border)] !bg-[color:var(--app-dropdown-bg)] !text-[color:var(--app-dropdown-text)]"
          comboboxGroupHeaderThemeClassName="!border-[color:var(--app-dropdown-border)] !text-[color:var(--app-dropdown-muted)]"
          comboboxItemThemeClassName="!text-[color:var(--app-dropdown-text)]"
          comboboxItemHighlightedThemeClassName="bg-[color:var(--app-input-bg-hover)]"
          isDisabled={isDisabled}
        />
      );
    }
    case CodeObjTypeEnum.PasswordParam: {
      const revealDisabled =
        isDisabled || isPasswordRevealPending || !onRevealPassword;
      const inputClassName = `${!isDisabled ? "cursor-text select-text" : ""} nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-text)]`;
      const revealClassName = `${revealDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} nodrag flex-none bg-transparent text-left font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-muted)] hover:text-[color:var(--app-text)]`;
      return (
        <>
          <div className="section-value flex min-w-0 items-center gap-2">
            <PasswordInput
              className={inputClassName}
              value={stringValue}
              onChange={onChange}
              onEscape={onEscape}
              isDisabled={isDisabled}
              placeholder={passwordPlaceholder}
              toggleClassName="flex-none !text-[color:var(--app-muted)] hover:!text-[color:var(--app-text)] dark:!text-[color:var(--app-muted)] dark:hover:!text-[color:var(--app-text)]"
            />
            {showPasswordReveal ? (
              <button
                type="button"
                className={revealClassName}
                onClick={onRevealPassword}
                disabled={revealDisabled}
                aria-busy={isPasswordRevealPending}
                title="Reveal saved password"
              >
                {isPasswordRevealPending ? "Revealing..." : "Reveal"}
              </button>
            ) : null}
          </div>
          <span className="section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]" />
        </>
      );
    }
    case CodeObjTypeEnum.DropzoneParam: {
      const mode = "mode" in codeObjImpl ? codeObjImpl.mode : null;
      const maxAttachments =
        "maxAttachments" in codeObjImpl
          ? codeObjImpl.maxAttachments ?? null
          : null;
      const placeholder =
        "placeholder" in codeObjImpl ? codeObjImpl.placeholder ?? null : null;
      return (
        <DropzoneInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={stringValue}
          onChange={onChange}
          onStatelessDrop={onDropzoneStateless}
          isDisabled={isDisabled}
          mode={mode ?? DropzoneModeEnum.STATEFUL}
          maxAttachments={maxAttachments}
          placeholder={placeholder ?? undefined}
          theme={{
            wrapperBaseClassName:
              "flex h-full w-full flex-1 items-center justify-center gap-2 rounded-xl border-4 border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-3 text-center [font-size:var(--app-text-xs)] font-bold uppercase tracking-widest text-[color:var(--app-muted)]",
            dragActiveClassName:
              "border-[color:var(--app-accent)] bg-[color:var(--app-surface-alt)] text-[color:var(--app-text)] ring-4 ring-[color:var(--app-accent)]",
            controlsRowClassName:
              "flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--app-muted)]",
            controlButtonClassName:
              "rounded-full border border-[color:var(--app-border)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[color:var(--app-muted)] hover:border-[color:var(--app-accent)] hover:text-[color:var(--app-text)] disabled:cursor-not-allowed disabled:opacity-50",
            uploadingTextClassName:
              "text-[10px] font-semibold uppercase tracking-widest text-[color:var(--app-muted)]",
            attachmentsContainerClassName:
              "flex flex-col gap-2 rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-2 text-[11px] text-[color:var(--app-text)]",
            attachmentSizeTextClassName:
              "text-[10px] uppercase tracking-wide text-[color:var(--app-muted)]",
            deleteButtonClassName:
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--app-muted)] hover:bg-[color:var(--app-surface-alt)] hover:text-[color:var(--app-text)]",
          }}
        />
      );
    }
    default:
      return null;
  }
}
