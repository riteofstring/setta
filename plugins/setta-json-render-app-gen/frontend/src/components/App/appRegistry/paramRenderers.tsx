import type { Action, UIElement } from "@json-render/core";

import type { ComponentRegistry } from "@json-render/react";

import {
  buildTextBlockTypographyScale,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  type AppSubsystemFrontendHost,
  type BaseChildlessCodeObjImplUnion,
  type BaseSectionImplUnion,
  callOpenAPI,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  type DateParamCodeObjImpl,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  DropzoneModeEnum,
  getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrentEffectiveSectionImpl,
  getCurrentSectionVariantId,
  getPasswordParamValue,
  getParamDisplayNameIfPresent,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  type LiteralDependencyValue,
  NO_PAN_CLASS_NAME,
  type ObjectValues,
  res200,
  SectionTypeEnum,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  setParamEnteredValue,
  shouldShowPasswordReveal,
  TextBlockFormatEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  type TimeParamCodeObjImpl,
  type DropzoneStatelessAttachment,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";

import _ from "lodash";

import React from "react";

import ReactMarkdown from "react-markdown";

import rehypeKatex from "rehype-katex";

import remarkGfm from "remark-gfm";

import remarkMath from "remark-math";

import {
  useAppSubsystemFrontendHost,
  useAppSubsystemServerModeState,
} from "../../../appSubsystemFrontendHostContext";

import {
  useAppConfigs,
  type AppConfigState,
} from "../../../appSubsystemProjectState";

import { useDecodedAppImageById } from "../../../appSubsystemImageArtifacts";

import { useLocalPendingValue } from "../../../appSubsystemPendingValue";

import { ensureAppProjectConfigLoaded } from "../../../state/actions/app";

import {
  resolveActionBinding,
  resolveActionType,
  resolveImageOutputBinding,
  resolveParamBinding,
  resolveTextOutputBinding,
} from "../appBindings";

import type { AppThemeHeadingSizes } from "../appTheme";

import {
  AppConfigScopeContext,
  useAppActionState,
  useAppConfigScope,
  useAppRuntime,
} from "../appContext";

import { resolveResponsiveValue, useAppBreakpoint } from "../appResponsive";

import {
  CodeBlock,
  ColorPickerInput,
  DropdownInput,
  DropzoneInput,
  PasswordInput,
  RotaryInput,
  SliderInput,
  TextInputCodeMirror,
  TextParamDateTimeInput,
} from "../../ui/AppRuntimeControls";

import { SwitchInput } from "../../ui/SwitchInput";

import {
  ALIGN_CLASS,
  ActionButtonKind,
  AppComponentProps,
  AppSubsystemNotify,
  BOX_BACKGROUND_BY_ROLE,
  CardHeader,
  CodeObjTypeValue,
  ConfigLanguageValue,
  HEADING_KEY_BY_LEVEL,
  HEADING_SIZE_CLASS_BY_LEVEL,
  HeadingLevel,
  JUSTIFY_CLASS,
  NumberishStyleKey,
  RawElementProps,
  ResolvedActionButtonState,
  ResolvedParamBindingState,
  ResolvedParamInputBindingResult,
  ResolvedTabDefinition,
  TabChildElement,
  assignNumberishStyle,
  buildActionParams,
  buildCardStyle,
  buildTypographyStyle,
  getParamBindingFailureState,
  handleActionButtonClick,
  hasValidParamCodeObjBinding,
  renderAppBindingMessage,
  resolveActionButtonAvailability,
  resolveActionButtonClassName,
  resolveActionButtonKind,
  resolveActionButtonPresentation,
  resolveActionButtonRuntimeContext,
  resolveActionButtonState,
  resolveCodeObjVariantIdForParam,
  resolveCodeParamBlocked,
  resolveConfigId,
  resolveElementProps,
  resolveGapValue,
  resolveHeadingPresentation,
  resolveHeadingTheme,
  resolveMotionSettings,
  resolveNullableStringProp,
  resolveNumberish,
  resolveParamBindingState,
  resolveParamEditabilityMessage,
  resolveParamInputBindingResult,
  resolveParamInputLabel,
  resolveParamInputRuntimeContext,
  resolveParamInputStatusMessage,
  resolveResponsiveNumberish,
  resolveStringProp,
  resolveTabDefinition,
  resolveTabKey,
  resolveTabTitle,
  useAppConfigLoadState,
} from "./paramPresentation";

import {
  Box,
  Card,
  ConfigScope,
  Container,
  Grid,
  Heading,
  ParamInputBlock,
  ParamInputBlockContent,
  ParamInputBlockContentProps,
  ResolvedParamInputBlockState,
  Spacer,
  Stack,
  Tab,
  Tabs,
  Text,
  hasNonEmptyChildrenMetadata,
  resolveHeadingLevel,
  resolveParamInputBlockState,
} from "./layoutElements";

import {
  APP_PARAM_BORDER_CLASS,
  APP_PARAM_TEXT_INPUT_ACTIVE_CLASS,
  APP_PARAM_TEXT_INPUT_CLASS,
  AppParamInput,
  AppParamInputProps,
  AppParamRenderContext,
  AppParamUIProps,
  expectDateParamImpl,
  expectTimeParamImpl,
  isParamSectionFrozen,
  noopAppParamEscape,
  resolveDropdownParamValue,
  resolveDropzoneSettings,
  resolveParamConfigLanguage,
  resolveParamDefaultValue,
  resolveParamNumericRange,
  resolveParamRenderContext,
  resolvePasswordParamState,
} from "./paramInputState";

import {
  ActionButton,
  Divider,
  ImageOutput,
  MOTION_PRESETS,
  Motion,
  Stagger,
  TextOutput,
  TextOutputContent,
  appRegistry,
  resolveEasing,
  resolveMotionPreset,
  resolveNumber,
  resolveTextOutputData,
  resolveTextOutputRuntimeContext,
} from "./actionsAndRegistry";

export function renderCodeMirrorParam(context: AppParamRenderContext) {
  const {
    configLanguage,
    defaultVal,
    isDisabled,
    onChange,
    onEscape,
    paramInfoId,
    sectionId,
    stringValue,
  } = context;
  const cursorClass = !isDisabled ? APP_PARAM_TEXT_INPUT_ACTIVE_CLASS : "";
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
        dummyCodeClassName={`${NO_PAN_CLASS_NAME} section-value self-end peer/textinput nodrag ${cursorClass} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`}
        realCodeClassName={`${NO_PAN_CLASS_NAME} nodrag self-end peer/textinput [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-[color:var(--app-surface-alt)] [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`}
        language={configLanguage}
        isDisabled={isDisabled}
        tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
        autocomplete={false}
      />
      <span className={APP_PARAM_BORDER_CLASS} />
    </>
  );
}

export function renderTimeParam(context: AppParamRenderContext) {
  const timeParamImpl = expectTimeParamImpl(context.codeObjImpl);
  const inputClassName = `${!context.isDisabled ? APP_PARAM_TEXT_INPUT_ACTIVE_CLASS : ""} ${APP_PARAM_TEXT_INPUT_CLASS}`;
  return (
    <TextParamDateTimeInput
      value={context.stringValue}
      onChange={context.onChange}
      onEscape={context.onEscape}
      isDisabled={context.isDisabled}
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
      inputClassName={inputClassName}
      formattedValueClassName="text-[10px] font-mono text-[color:var(--app-muted)]"
      borderClassName={APP_PARAM_BORDER_CLASS}
    />
  );
}

export function renderDateParam(context: AppParamRenderContext) {
  const dateParamImpl = expectDateParamImpl(context.codeObjImpl);
  const inputClassName = `${!context.isDisabled ? APP_PARAM_TEXT_INPUT_ACTIVE_CLASS : ""} ${APP_PARAM_TEXT_INPUT_CLASS}`;
  return (
    <TextParamDateTimeInput
      value={context.stringValue}
      onChange={context.onChange}
      onEscape={context.onEscape}
      isDisabled={context.isDisabled}
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
      inputClassName={inputClassName}
      formattedValueClassName="text-[10px] font-mono text-[color:var(--app-muted)]"
      borderClassName={APP_PARAM_BORDER_CLASS}
    />
  );
}

export function renderSliderParam(context: AppParamRenderContext) {
  const { max, min, step } = resolveParamNumericRange(context.codeObjImpl);
  const numericValue = _.toNumber(context.value);
  const resolvedValue = Number.isFinite(numericValue) ? numericValue : min;
  return (
    <SliderInput
      value={resolvedValue}
      onChange={(next) => context.onChange(next)}
      onEscape={context.onEscape}
      min={min}
      max={max}
      step={step}
      isDisabled={context.isDisabled}
      wrapperDivClass={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} cursor-pointer @container/slider section-value flex gap-1`}
      sliderRootClassName=" data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5"
      sliderTrackClassName="relative flex-grow rounded-full bg-[color:var(--app-surface-alt)] data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px]"
      sliderRangeClassName="absolute h-full rounded-full bg-[color:var(--app-accent)]"
      sliderThumbClassName={`${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} block h-3 w-3 cursor-pointer rounded-full border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface)] shadow-sm drop-shadow-md hover:!bg-[color:var(--app-surface-alt)] focus-visible:!border-[color:var(--app-accent)] focus-visible:bg-[color:var(--app-accent)] focus-visible:outline-none data-[disabled]:pointer-events-none`}
      textInputClassName="hidden my-auto mr-[1px] h-5/6 w-8 cursor-auto resize-none rounded-lg border border-solid border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-2 text-center font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-text)] focus-visible:border-[color:var(--app-accent)] @[132px]/slider:block"
    />
  );
}

export function renderRotaryParam(context: AppParamRenderContext) {
  const { max, min, step } = resolveParamNumericRange(context.codeObjImpl);
  const numericValue = _.toNumber(context.value);
  const resolvedValue = Number.isFinite(numericValue) ? numericValue : min;
  return (
    <RotaryInput
      value={resolvedValue}
      onChange={context.onChange}
      onEscape={context.onEscape}
      min={min}
      max={max}
      step={step}
      isDisabled={context.isDisabled}
      indicatorThemeClassName="bg-[color:var(--app-accent)]"
    />
  );
}

export function renderSwitchParam(context: AppParamRenderContext) {
  const defaultVal =
    typeof context.defaultVal === "boolean" ||
    typeof context.defaultVal === "string"
      ? context.defaultVal
      : undefined;
  const resolvedValue =
    typeof context.value === "boolean" || typeof context.value === "string"
      ? context.value
      : Boolean(context.value);
  return (
    <SwitchInput
      value={resolvedValue}
      defaultVal={defaultVal}
      onChange={(next) => context.onChange(next)}
      onEscape={context.onEscape}
      isDisabled={context.isDisabled}
      outerDivClassName="section-value flex justify-self-start self-center"
      rootThemeClassName="bg-[color:var(--app-surface-alt)] data-[state='checked']:bg-[color:var(--app-accent)] focus-visible:ring-[color:var(--app-accent)]"
      thumbThemeClassName="bg-[color:var(--app-surface)]"
    />
  );
}

export function renderColorPickerParam(context: AppParamRenderContext) {
  const colorChoices =
    "colorChoices" in context.codeObjImpl
      ? context.codeObjImpl.colorChoices
      : [];
  return (
    <ColorPickerInput
      colorChoices={colorChoices}
      value={context.stringValue}
      onChange={context.onChange}
      onEscape={context.onEscape}
      wrapperClassName="section-value single-cell-container min-w-0 w-[calc(100%_-_2px)] justify-self-start self-center h-[calc(100%_-_4px)] min-h-0"
      colorPickerChoicesClasses="flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-full min-h-0 w-full min-w-0 items-center"
      isDisabled={context.isDisabled}
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

export function renderDropdownParam(context: AppParamRenderContext) {
  const choices =
    "choices" in context.codeObjImpl ? context.codeObjImpl.choices : [];
  return (
    <DropdownInput
      choices={choices}
      value={resolveDropdownParamValue(context.value, context.stringValue)}
      onChange={context.onChange}
      outerDivClasses="section-value flex justify-self-start self-center [&_search]:my-auto"
      comboboxInputThemeClassName="!bg-[color:var(--app-input-bg)] hover:!bg-[color:var(--app-input-bg-hover)] !border-[color:var(--app-input-border)] !text-[color:var(--app-input-text)] !placeholder:text-[color:var(--app-input-placeholder)] focus:!border-[color:var(--app-input-focus-border)] focus-visible:!ring-[color:var(--app-input-ring)]"
      comboboxRightButtonThemeClassName="!text-[color:var(--app-dropdown-muted)] hover:!bg-[color:var(--app-input-bg-hover)] hover:!text-[color:var(--app-dropdown-text)] dark:!text-[color:var(--app-dropdown-muted)] dark:hover:!bg-[color:var(--app-input-bg-hover)] dark:hover:!text-[color:var(--app-dropdown-text)]"
      comboboxListThemeClassName="!border-[color:var(--app-dropdown-border)] !bg-[color:var(--app-dropdown-bg)] !text-[color:var(--app-dropdown-text)]"
      comboboxGroupHeaderThemeClassName="!border-[color:var(--app-dropdown-border)] !text-[color:var(--app-dropdown-muted)]"
      comboboxItemThemeClassName="!text-[color:var(--app-dropdown-text)]"
      comboboxItemHighlightedThemeClassName="bg-[color:var(--app-input-bg-hover)]"
      isDisabled={context.isDisabled}
    />
  );
}

export function renderPasswordParam(context: AppParamRenderContext) {
  const revealDisabled =
    context.isDisabled ||
    context.isPasswordRevealPending ||
    !context.onRevealPassword;
  const inputClassName = `${!context.isDisabled ? APP_PARAM_TEXT_INPUT_ACTIVE_CLASS : ""} ${APP_PARAM_TEXT_INPUT_CLASS}`;
  const revealClassName = `${revealDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} nodrag flex-none bg-transparent text-left font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-muted)] hover:text-[color:var(--app-text)]`;
  return (
    <>
      <div className="section-value flex min-w-0 items-center gap-2">
        <PasswordInput
          className={inputClassName}
          value={context.stringValue}
          onChange={context.onChange}
          onEscape={context.onEscape}
          isDisabled={context.isDisabled}
          placeholder={context.passwordPlaceholder}
          toggleClassName="flex-none !text-[color:var(--app-muted)] hover:!text-[color:var(--app-text)] dark:!text-[color:var(--app-muted)] dark:hover:!text-[color:var(--app-text)]"
        />
        {context.showPasswordReveal ? (
          <button
            type="button"
            className={revealClassName}
            onClick={context.onRevealPassword}
            disabled={revealDisabled}
            aria-busy={context.isPasswordRevealPending}
            title="Reveal saved password"
          >
            {context.isPasswordRevealPending ? "Revealing..." : "Reveal"}
          </button>
        ) : null}
      </div>
      <span className={APP_PARAM_BORDER_CLASS} />
    </>
  );
}

export function renderDropzoneParam(context: AppParamRenderContext) {
  const { maxAttachments, mode, placeholder } = resolveDropzoneSettings(
    context.codeObjImpl,
  );
  return (
    <DropzoneInput
      configId={context.configId}
      sectionId={context.sectionId}
      paramInfoId={context.paramInfoId}
      value={context.stringValue}
      onChange={context.onChange}
      onStatelessDrop={context.onDropzoneStateless}
      isDisabled={context.isDisabled}
      mode={mode}
      maxAttachments={maxAttachments}
      placeholder={placeholder}
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

export const APP_PARAM_RENDERERS: Partial<
  Record<CodeObjTypeValue, (context: AppParamRenderContext) => React.ReactNode>
> = {
  [CodeObjTypeEnum.CodeParam]: renderCodeMirrorParam,
  [CodeObjTypeEnum.TextAreaParam]: renderCodeMirrorParam,
  [CodeObjTypeEnum.TextParam]: renderCodeMirrorParam,
  [CodeObjTypeEnum.TimeParam]: renderTimeParam,
  [CodeObjTypeEnum.DateParam]: renderDateParam,
  [CodeObjTypeEnum.SliderParam]: renderSliderParam,
  [CodeObjTypeEnum.RotaryParam]: renderRotaryParam,
  [CodeObjTypeEnum.SwitchParam]: renderSwitchParam,
  [CodeObjTypeEnum.ColorPickerParam]: renderColorPickerParam,
  [CodeObjTypeEnum.DropdownParam]: renderDropdownParam,
  [CodeObjTypeEnum.PasswordParam]: renderPasswordParam,
  [CodeObjTypeEnum.DropzoneParam]: renderDropzoneParam,
};

export function AppParamUI(props: AppParamUIProps) {
  const context = resolveParamRenderContext(props);
  const renderer = APP_PARAM_RENDERERS[context.codeObjImpl.type];
  if (!renderer) {
    return null;
  }
  return renderer(context);
}

export const throttledParamUpdateErrorByNotify = new WeakMap<
  AppSubsystemNotify,
  (message: string) => void
>();

export function notifyParamUpdateError(
  notify: AppSubsystemNotify,
  message: string,
): void {
  let throttledNotify = throttledParamUpdateErrorByNotify.get(notify);
  if (!throttledNotify) {
    const nextThrottledNotify = _.throttle(
      (nextMessage: string) => {
        notify({
          message: nextMessage,
          type: "error",
        });
      },
      2500,
      { trailing: false },
    );
    throttledParamUpdateErrorByNotify.set(notify, nextThrottledNotify);
    throttledNotify = nextThrottledNotify;
  }
  throttledNotify(message);
}

export const debouncedSetParamEnteredValue = _.debounce(
  (
    configId: string,
    sectionId: string,
    sectionVariantId: string,
    paramInfoId: string,
    value: string,
    notify: AppSubsystemNotify,
  ) => {
    callOpenAPI(
      setParamEnteredValue({
        body: {
          projectConfigId: configId,
          sectionId,
          sectionVariantId,
          paramInfoId,
          value,
        },
      } as Parameters<typeof setParamEnteredValue>[0]),
    ).then((response) => {
      if (res200(response)) {
        return;
      }
      notifyParamUpdateError(
        notify,
        response.status === 403
          ? "This parameter cannot be edited in app deployments."
          : "Failed to update parameter.",
      );
    });
  },
  50,
);

export const debouncedSetPasswordParamValue = _.debounce(
  (
    configId: string,
    sectionId: string,
    sectionVariantId: string,
    paramInfoId: string,
    value: string,
    notify: AppSubsystemNotify,
  ) => {
    callOpenAPI(
      setParamEnteredValue({
        body: {
          projectConfigId: configId,
          sectionId,
          sectionVariantId,
          paramInfoId,
          value,
        },
      } as Parameters<typeof setParamEnteredValue>[0]),
    ).then((response) => {
      if (res200(response)) {
        return;
      }
      notifyParamUpdateError(
        notify,
        response.status === 403
          ? "This parameter cannot be edited in app deployments."
          : "Failed to update parameter.",
      );
    });
  },
  50,
);
