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
  APP_PARAM_RENDERERS,
  AppParamUI,
  debouncedSetParamEnteredValue,
  debouncedSetPasswordParamValue,
  notifyParamUpdateError,
  renderCodeMirrorParam,
  renderColorPickerParam,
  renderDateParam,
  renderDropdownParam,
  renderDropzoneParam,
  renderPasswordParam,
  renderRotaryParam,
  renderSliderParam,
  renderSwitchParam,
  renderTimeParam,
  throttledParamUpdateErrorByNotify,
} from "./paramRenderers";

export function ActionButton({ element, onAction }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const scope = useAppConfigScope();
  const runtimeContext = resolveActionButtonRuntimeContext(runtime, "");
  const { configId, action, sectionId, label } = resolveActionBinding(
    props,
    runtimeContext.dataBindings,
  );
  const actionName = action ?? "";
  const actionRuntime = resolveActionButtonRuntimeContext(runtime, actionName);
  const resolvedConfigId = resolveConfigId(
    configId,
    actionRuntime.defaultConfigId,
    scope.configId,
  );
  const { canRun, isRunning, runDisabledReason } = useAppActionState();
  const {
    actionName: resolvedActionName,
    disabledReason,
    isDisabled,
    isRunAction,
    resolvedLabel,
  } = resolveActionButtonState({
    action,
    actionDefinition: actionRuntime.actionDefinition,
    allowDownloads: actionRuntime.allowDownloads,
    allowLinks: actionRuntime.allowLinks,
    canRun,
    isRunning,
    label,
    runDisabledReason,
  });
  const { buttonLabel, buttonTitle } = resolveActionButtonPresentation({
    disabledReason,
    isDisabled,
    isRunAction,
    isRunning,
    resolvedLabel,
  });
  return (
    <button
      type="button"
      className={resolveActionButtonClassName(isDisabled)}
      title={buttonTitle}
      onClick={() =>
        handleActionButtonClick({
          actionName: resolvedActionName,
          isDisabled,
          onAction,
          resolvedConfigId,
          sectionId,
        })
      }
      disabled={isDisabled}
    >
      {buttonLabel}
    </button>
  );
}

export function resolveTextOutputRuntimeContext(
  runtime: ReturnType<typeof useAppRuntime>,
) {
  if (!runtime) {
    return {
      dataBindings: undefined,
      defaultConfigId: null,
    };
  }
  return {
    dataBindings: runtime.dataBindings,
    defaultConfigId: runtime.defaultConfigId ?? null,
  };
}

export function resolveTextOutputData(
  configState: AppConfigState | null,
  sectionId: string | null,
) {
  if (!configState || !sectionId) {
    return null;
  }
  const variantId =
    configState.previewSectionVariantMap[sectionId] ??
    configState.projectConfig.sectionVariantMap?.[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = configState.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = configState.sectionImpls[variant.impl];
  const core = configState.sections[sectionId];
  if (!impl || !core) {
    return null;
  }
  const effectiveImpl: BaseSectionImplUnion = {
    ...impl,
    ...core.sharedModifier,
    ...variant.modifier,
  };
  if (effectiveImpl.type !== SectionTypeEnum.TextBlock) {
    return null;
  }
  return {
    format: effectiveImpl.format,
    masterFontSizePx: effectiveImpl.masterFontSizePx,
    text: effectiveImpl.text,
  };
}

export function TextOutputContent(props: {
  format: ObjectValues<typeof TextBlockFormatEnum>;
  label: string | null;
  masterFontSizePx: number;
  text: string;
}) {
  const typography = buildTextBlockTypographyScale(props.masterFontSizePx);
  const markdownTypographyStyle = {
    "--setta-textblock-body-size": `${typography.bodyPx}px`,
    "--setta-textblock-code-size": `${typography.codePx}px`,
    "--setta-textblock-h1-size": `${typography.h1Px}px`,
    "--setta-textblock-h2-size": `${typography.h2Px}px`,
    "--setta-textblock-h3-size": `${typography.h3Px}px`,
    "--setta-textblock-h4-size": `${typography.h4Px}px`,
    "--setta-textblock-h5-size": `${typography.h5Px}px`,
    "--setta-textblock-h6-size": `${typography.h6Px}px`,
  } as React.CSSProperties;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-3">
      {props.label && (
        <div className="font-semibold uppercase tracking-wide text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
          {props.label}
        </div>
      )}
      {props.format === TextBlockFormatEnum.Markdown ? (
        <div style={markdownTypographyStyle}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            className="prose max-w-none text-[color:var(--app-text)] dark:prose-invert prose-h1:text-[length:var(--setta-textblock-h1-size)] prose-h2:text-[length:var(--setta-textblock-h2-size)] prose-h3:text-[length:var(--setta-textblock-h3-size)] prose-h4:text-[length:var(--setta-textblock-h4-size)] prose-h5:text-[length:var(--setta-textblock-h5-size)] prose-h6:text-[length:var(--setta-textblock-h6-size)] prose-p:text-[length:var(--setta-textblock-body-size)] prose-code:text-[length:var(--setta-textblock-code-size)] prose-pre:text-[length:var(--setta-textblock-code-size)] prose-li:text-[length:var(--setta-textblock-body-size)]"
            components={{ code: CodeBlock }}
          >
            {props.text}
          </ReactMarkdown>
        </div>
      ) : (
        <pre
          className="whitespace-pre-wrap text-[color:var(--app-text)]"
          style={{ fontSize: `${typography.bodyPx}px` }}
        >
          {props.text}
        </pre>
      )}
    </div>
  );
}

export function TextOutput({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const scope = useAppConfigScope();
  const runtimeContext = resolveTextOutputRuntimeContext(runtime);
  const { configId, sectionId, label } = resolveTextOutputBinding(
    props,
    runtimeContext.dataBindings,
  );
  const resolvedConfigId = resolveConfigId(
    configId,
    runtimeContext.defaultConfigId,
    scope.configId,
  );
  const configState = useAppConfigs((state) =>
    resolvedConfigId ? state.configs[resolvedConfigId] : null,
  );
  useAppConfigLoadState(resolvedConfigId, configState);
  const textData = React.useMemo(
    () => resolveTextOutputData(configState, sectionId),
    [configState, sectionId],
  );
  if (!resolvedConfigId || !sectionId || !textData) {
    return renderAppBindingMessage("Missing text output.");
  }
  return <TextOutputContent {...textData} label={label} />;
}

export function ImageOutput({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const { artifactId, alt } = resolveImageOutputBinding(
    props,
    runtime?.dataBindings,
  );
  const resolvedAlt = alt ?? "App output image";
  const decodedImage = useDecodedAppImageById(artifactId);
  if (!artifactId) {
    return (
      <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
        Missing image binding.
      </div>
    );
  }
  return (
    <figure className="flex min-h-[120px] items-center justify-center rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-3">
      {decodedImage ? (
        <img
          src={decodedImage.src}
          alt={resolvedAlt}
          className="h-auto max-h-[320px] w-full object-contain"
        />
      ) : (
        <div className="text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
          Waiting for image output…
        </div>
      )}
    </figure>
  );
}

export function Divider({ element }: AppComponentProps) {
  const props = resolveElementProps(element);
  const className = resolveStringProp(props.className);
  return (
    <hr className={`border-[color:var(--app-border)] ${className}`.trim()} />
  );
}

export const MOTION_PRESETS = new Set([
  "none",
  "fadeIn",
  "slideUp",
  "slideDown",
  "slideLeft",
  "slideRight",
  "scaleIn",
]);

export function resolveMotionPreset(raw: unknown): string {
  if (typeof raw === "string" && MOTION_PRESETS.has(raw)) {
    return raw;
  }
  return "fadeIn";
}

export function resolveNumber(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || Number.isNaN(raw) || !Number.isFinite(raw)) {
    return fallback;
  }
  return raw;
}

export function resolveEasing(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }
  return fallback;
}

export function Motion({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const className = resolveStringProp(props.className);
  const themeMotion = runtime?.theme?.motion;
  const { delayMs, durationMs, easing, preset } = resolveMotionSettings({
    delayMs: props.delayMs,
    durationMs: props.durationMs,
    easing: props.easing,
    preset: props.preset,
    themeMotion,
  });
  const presetClass = `setta-app-motion--${preset}`;
  return (
    <div
      className={`setta-app-motion ${presetClass} ${className}`.trim()}
      style={{
        animationDuration: `${Math.max(durationMs, 0)}ms`,
        animationDelay: `${Math.max(delayMs, 0)}ms`,
        animationTimingFunction: easing,
      }}
    >
      {children}
    </div>
  );
}

export function Stagger({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const className = resolveStringProp(props.className);
  const themeMotion = runtime?.theme?.motion;
  const { delayMs, durationMs, easing, preset, staggerMs } =
    resolveMotionSettings({
      delayMs: props.delayMs,
      durationMs: props.durationMs,
      easing: props.easing,
      preset: props.preset,
      staggerMs: props.staggerMs,
      themeMotion,
    });
  const items = React.Children.toArray(children);
  const presetClass = `setta-app-motion--${preset}`;
  return (
    <div className={`setta-app-stagger ${className}`.trim()}>
      {items.map((child, idx) => (
        <div
          key={`stagger-${idx}`}
          className={`setta-app-motion ${presetClass}`.trim()}
          style={{
            animationDuration: `${Math.max(durationMs, 0)}ms`,
            animationDelay: `${Math.max(delayMs + idx * staggerMs, 0)}ms`,
            animationTimingFunction: easing,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

export const appRegistry: ComponentRegistry = {
  Stack,
  Box,
  Grid,
  Container,
  Spacer,
  Motion,
  Stagger,
  Card,
  ConfigScope,
  Tabs,
  Tab,
  Heading,
  Text,
  ParamInput: ParamInputBlock,
  ActionButton,
  TextOutput,
  ImageOutput,
  Divider,
};
