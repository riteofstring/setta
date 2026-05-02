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
} from "../../appSubsystemFrontendHostContext";

import {
  useAppConfigs,
  type AppConfigState,
} from "../../appSubsystemProjectState";

import { useDecodedAppImageById } from "../../appSubsystemImageArtifacts";

import { useLocalPendingValue } from "../../appSubsystemPendingValue";

import { ensureAppProjectConfigLoaded } from "../../state/actions/app";

import {
  resolveActionBinding,
  resolveActionType,
  resolveImageOutputBinding,
  resolveParamBinding,
  resolveTextOutputBinding,
} from "./appBindings";

import type { AppThemeHeadingSizes } from "./appTheme";

import {
  AppConfigScopeContext,
  useAppActionState,
  useAppConfigScope,
  useAppRuntime,
} from "./appContext";

import { resolveResponsiveValue, useAppBreakpoint } from "./appResponsive";

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
} from "../ui/AppRuntimeControls";

import { SwitchInput } from "../ui/SwitchInput";

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

export type AppComponentProps = {
  element: UIElement<string, Record<string, unknown>>;
  children?: React.ReactNode;
  onAction?: (action: Action) => void;
  loading?: boolean;
};

export type RawElementProps = AppComponentProps["element"];

export type TabChildElement = React.ReactElement<AppComponentProps>;

export type HeadingLevel = 1 | 2 | 3 | 4;

export type NumberishStyleKey =
  | "padding"
  | "borderRadius"
  | "fontSize"
  | "lineHeight"
  | "maxWidth"
  | "width"
  | "height";

export type ConfigLanguageValue =
  (typeof ConfigLanguageEnum)[keyof typeof ConfigLanguageEnum];

export type CodeObjTypeValue =
  (typeof CodeObjTypeEnum)[keyof typeof CodeObjTypeEnum];

export const ALIGN_CLASS: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

export const JUSTIFY_CLASS: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};

export const BOX_BACKGROUND_BY_ROLE: Record<string, string> = {
  background: "var(--app-background)",
  surface: "var(--app-surface)",
  surfaceAlt: "var(--app-surface-alt)",
  card: "var(--app-card-bg)",
};

export type AppSubsystemNotify = AppSubsystemFrontendHost["notify"];

export function resolveConfigId(
  bindingConfigId: string | null,
  runtimeConfigId: string | null,
  scopeConfigId: string | null,
) {
  return bindingConfigId ?? scopeConfigId ?? runtimeConfigId ?? null;
}

export function resolveElementProps(
  element: AppComponentProps["element"],
): Record<string, unknown> {
  return element.props;
}

export function resolveStringProp(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? raw : fallback;
}

export function resolveNullableStringProp(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

export function resolveNumberish(raw: unknown): number | string | null {
  return typeof raw === "number" || typeof raw === "string" ? raw : null;
}

export function resolveResponsiveNumberish(
  raw: unknown,
  breakpoint: ReturnType<typeof useAppBreakpoint>,
): number | string | null {
  return resolveNumberish(resolveResponsiveValue(raw, breakpoint));
}

export function resolveGapValue(
  raw: unknown,
  breakpoint: ReturnType<typeof useAppBreakpoint>,
  themeGap: unknown,
): number | string {
  return (
    resolveResponsiveNumberish(raw, breakpoint) ??
    resolveNumberish(themeGap) ??
    16
  );
}

export function assignNumberishStyle(
  style: React.CSSProperties,
  key: NumberishStyleKey,
  value: number | string | null,
): void {
  if (value === null) {
    return;
  }
  style[key] = typeof value === "number" ? `${value}px` : value;
}

export function buildCardStyle(
  cardPadding: unknown,
  cardRadius: unknown,
): React.CSSProperties {
  const style: React.CSSProperties = {
    boxShadow: "var(--app-card-shadow, 0 1px 2px 0 rgb(0 0 0 / 0.05))",
  };
  assignNumberishStyle(style, "padding", resolveNumberish(cardPadding));
  assignNumberishStyle(style, "borderRadius", resolveNumberish(cardRadius));
  return style;
}

export function buildTypographyStyle(args: {
  fontFamily?: string | undefined;
  fontSize: unknown;
  lineHeight: unknown;
}): React.CSSProperties | undefined {
  const { fontFamily, fontSize, lineHeight } = args;
  const style: React.CSSProperties = {};
  if (fontFamily) {
    style.fontFamily = fontFamily;
  }
  assignNumberishStyle(style, "fontSize", resolveNumberish(fontSize));
  assignNumberishStyle(style, "lineHeight", resolveNumberish(lineHeight));
  return Object.keys(style).length > 0 ? style : undefined;
}

export function resolveMotionSettings(args: {
  delayMs: unknown;
  durationMs: unknown;
  easing: unknown;
  preset: unknown;
  themeMotion:
    | {
        delayMs?: number;
        durationMs?: number;
        easing?: string;
        staggerMs?: number;
      }
    | null
    | undefined;
  staggerMs?: unknown;
}) {
  const { delayMs, durationMs, easing, preset, staggerMs, themeMotion } = args;
  const fallbackEasing = themeMotion?.easing ?? "cubic-bezier(0.16, 1, 0.3, 1)";
  return {
    delayMs: resolveNumber(delayMs, themeMotion?.delayMs ?? 0),
    durationMs: resolveNumber(durationMs, themeMotion?.durationMs ?? 220),
    easing: resolveEasing(easing, fallbackEasing),
    preset: resolveMotionPreset(preset),
    staggerMs: resolveNumber(staggerMs, themeMotion?.staggerMs ?? 70),
  };
}

export type ResolvedTabDefinition = {
  child: TabChildElement;
  hasContent: boolean;
  key: string;
  title: string;
};

export function resolveTabKey(
  child: TabChildElement,
  index: number,
  tabElement: RawElementProps | null,
): string {
  if (tabElement && typeof tabElement.key === "string" && tabElement.key) {
    return tabElement.key;
  }
  return typeof child.key === "string" ? child.key : `tab-${index}`;
}

export function resolveTabTitle(
  index: number,
  tabElement: RawElementProps | null,
): string {
  if (tabElement?.props && typeof tabElement.props.title === "string") {
    return tabElement.props.title;
  }
  return `Tab ${index + 1}`;
}

export function resolveTabDefinition(
  child: TabChildElement,
  index: number,
): ResolvedTabDefinition {
  const tabElement = child.props?.element ?? null;
  return {
    child,
    hasContent:
      hasNonEmptyChildrenMetadata(tabElement) ||
      React.Children.count(child.props?.children) > 0,
    key: resolveTabKey(child, index, tabElement),
    title: resolveTabTitle(index, tabElement),
  };
}

export function CardHeader(props: {
  description: string | null;
  title: string | null;
}) {
  const { description, title } = props;
  if (!title && !description) {
    return null;
  }
  return (
    <header className="flex flex-col gap-1">
      {title ? (
        <h3 className="font-semibold text-[color:var(--app-text)] [font-size:var(--app-text-sm)]">
          {title}
        </h3>
      ) : null}
      {description ? (
        <p className="text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
          {description}
        </p>
      ) : null}
    </header>
  );
}

export const HEADING_KEY_BY_LEVEL: Record<
  HeadingLevel,
  keyof AppThemeHeadingSizes
> = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
};

export const HEADING_SIZE_CLASS_BY_LEVEL: Record<number, string> = {
  1: "[font-size:var(--app-text-2xl)]",
  2: "[font-size:var(--app-text-xl)]",
  3: "[font-size:var(--app-text-lg)]",
  4: "[font-size:var(--app-text-base)]",
};

export function resolveHeadingPresentation(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 4) as HeadingLevel;
  return {
    clampedLevel,
    headingSizeKey: HEADING_KEY_BY_LEVEL[clampedLevel],
    sizeClass:
      HEADING_SIZE_CLASS_BY_LEVEL[clampedLevel] ??
      "[font-size:var(--app-text-base)]",
  };
}

export type ResolvedActionButtonState = {
  actionName: string;
  actionType: string | null;
  disabledReason: string | null;
  isDisabled: boolean;
  isRunAction: boolean;
  resolvedLabel: string;
};

export type ActionButtonKind = "default" | "download" | "externalLink" | "run";

export function resolveActionButtonKind(
  actionName: string,
  actionType: string | null,
): ActionButtonKind {
  if (actionName === "run" || actionType === "run") {
    return "run";
  }
  if (actionType === "downloadArtifact" || actionType === "downloadBinary") {
    return "download";
  }
  if (actionType === "openExternalLink") {
    return "externalLink";
  }
  return "default";
}

export function resolveActionButtonAvailability(args: {
  allowDownloads: boolean;
  allowLinks: boolean;
  canRun: boolean;
  isRunning: boolean;
  kind: ActionButtonKind;
  runDisabledReason: string | null;
}): Pick<
  ResolvedActionButtonState,
  "disabledReason" | "isDisabled" | "isRunAction"
> {
  switch (args.kind) {
    case "run": {
      const isDisabled = !args.canRun || args.isRunning;
      return {
        disabledReason: isDisabled
          ? args.runDisabledReason ?? "Run disabled"
          : null,
        isDisabled,
        isRunAction: true,
      };
    }
    case "download":
      return {
        disabledReason: args.allowDownloads
          ? null
          : "File downloads are disabled by policy.",
        isDisabled: !args.allowDownloads,
        isRunAction: false,
      };
    case "externalLink":
      return {
        disabledReason: args.allowLinks
          ? null
          : "External links are disabled by policy.",
        isDisabled: !args.allowLinks,
        isRunAction: false,
      };
    default:
      return {
        disabledReason: null,
        isDisabled: false,
        isRunAction: false,
      };
  }
}

export function resolveActionButtonState(args: {
  action: string | null;
  actionDefinition: unknown;
  allowDownloads: boolean;
  allowLinks: boolean;
  canRun: boolean;
  isRunning: boolean;
  label: string | null;
  runDisabledReason: string | null;
}): ResolvedActionButtonState {
  const {
    action,
    actionDefinition,
    allowDownloads,
    allowLinks,
    canRun,
    isRunning,
    label,
    runDisabledReason,
  } = args;
  const actionName = action ?? "";
  const actionType = resolveActionType(
    actionName,
    actionDefinition ?? undefined,
  );
  const { disabledReason, isDisabled, isRunAction } =
    resolveActionButtonAvailability({
      allowDownloads,
      allowLinks,
      canRun,
      isRunning,
      kind: resolveActionButtonKind(actionName, actionType),
      runDisabledReason,
    });
  return {
    actionName,
    actionType,
    disabledReason,
    isDisabled,
    isRunAction,
    resolvedLabel: label ?? "Run",
  };
}

export function buildActionParams(
  resolvedConfigId: string | null,
  sectionId: string | null,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (sectionId) {
    params.sectionId = sectionId;
  }
  if (resolvedConfigId) {
    params.configId = resolvedConfigId;
  }
  return params;
}

export type ResolvedParamBindingState = {
  canRenderParam: boolean;
  codeObjImpl: BaseChildlessCodeObjImplUnion | null;
  displayName: string | null;
  sectionImpl: BaseSectionImplUnion | null;
};

export function getParamBindingFailureState(): ResolvedParamBindingState {
  return {
    canRenderParam: false,
    codeObjImpl: null,
    displayName: null,
    sectionImpl: null,
  };
}

export function resolveCodeObjVariantIdForParam(args: {
  paramId: string;
  sectionImpl: BaseSectionImplUnion;
}): string | null {
  const { paramId, sectionImpl } = args;
  if (sectionImpl.type === SectionTypeEnum.MetaControl) {
    const controlParamId = sectionImpl.metaControlParamId;
    if (!controlParamId || controlParamId !== paramId) {
      return null;
    }
    return sectionImpl.codeObjVariantMap?.[paramId] ?? null;
  }
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    return null;
  }
  return sectionImpl.codeObjVariantMap[paramId] ?? null;
}

export function resolveParamBindingState(args: {
  configState: AppConfigState;
  paramId: string;
  sectionId: string;
}): ResolvedParamBindingState {
  const { configState, paramId, sectionId } = args;
  const variantId =
    configState.previewSectionVariantMap[sectionId] ??
    configState.projectConfig.sectionVariantMap?.[sectionId];
  if (variantId === undefined) {
    return getParamBindingFailureState();
  }
  const variant = configState.sectionVariants[variantId];
  if (!variant) {
    return getParamBindingFailureState();
  }
  const sectionImpl = configState.sectionImpls[variant.impl];
  if (!sectionImpl || !configState.sections[sectionId]) {
    return getParamBindingFailureState();
  }
  const codeObjVariantId = resolveCodeObjVariantIdForParam({
    paramId,
    sectionImpl,
  });
  if (!codeObjVariantId) {
    return getParamBindingFailureState();
  }
  if (!hasValidParamCodeObjBinding(configState, codeObjVariantId, paramId)) {
    return getParamBindingFailureState();
  }
  const previewActive =
    configState.previewSectionVariantMap[sectionId] !== undefined;
  const effectiveSectionImpl = getCurrentEffectiveSectionImpl(
    configState,
    sectionId,
    previewActive,
  );
  const effectiveCodeObjImpl =
    getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent(
      configState,
      sectionId,
      paramId,
      isBaseChildlessCodeObjImpl,
      previewActive,
    );
  if (!effectiveCodeObjImpl) {
    return getParamBindingFailureState();
  }
  return {
    canRenderParam: true,
    codeObjImpl: effectiveCodeObjImpl,
    displayName: getParamDisplayNameIfPresent(configState, sectionId, paramId),
    sectionImpl: effectiveSectionImpl,
  };
}

export function hasValidParamCodeObjBinding(
  configState: AppConfigState,
  codeObjVariantId: string,
  paramId: string,
): boolean {
  const codeObjVariant = configState.codeObjVariants[codeObjVariantId];
  return Boolean(
    codeObjVariant &&
      configState.codeObjImpls[codeObjVariant.impl] &&
      configState.codeObjs[paramId],
  );
}

export function renderAppBindingMessage(message: string) {
  return (
    <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
      {message}
    </div>
  );
}

export function resolveActionButtonClassName(isDisabled: boolean): string {
  return `rounded-full px-4 py-2 font-semibold transition-colors [font-size:var(--app-text-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-button-ring,_var(--app-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-background)] ${
    isDisabled
      ? "cursor-not-allowed bg-[color:var(--app-button-disabled-bg,_var(--app-surface-alt))] text-[color:var(--app-button-disabled-text,_var(--app-muted))]"
      : "bg-[color:var(--app-button-bg,_var(--app-accent))] text-[color:var(--app-button-text,_var(--app-accent-text))] hover:bg-[color:var(--app-button-bg-hover,_var(--app-accent-hover))]"
  }`;
}

export function handleActionButtonClick(args: {
  actionName: string;
  isDisabled: boolean;
  onAction: ((action: Action) => void) | undefined;
  resolvedConfigId: string | null;
  sectionId: string | null;
}): void {
  const { actionName, isDisabled, onAction, resolvedConfigId, sectionId } =
    args;
  if (!actionName || !onAction || isDisabled) {
    return;
  }
  onAction({
    name: actionName,
    params: buildActionParams(resolvedConfigId, sectionId),
  });
}

export function resolveParamInputStatusMessage(args: {
  canRenderParam: boolean;
  codeObjImpl: BaseChildlessCodeObjImplUnion | null;
  configState: AppConfigState | null;
  resolvedConfigId: string | null;
  sectionId: string | null;
  sectionImpl: BaseSectionImplUnion | null;
  paramId: string | null;
}): string | null {
  const {
    canRenderParam,
    codeObjImpl,
    configState,
    resolvedConfigId,
    sectionId,
    sectionImpl,
    paramId,
  } = args;
  if (!resolvedConfigId) {
    return "Missing config scope.";
  }
  if (!configState) {
    return "Loading config…";
  }
  if (
    !sectionId ||
    !paramId ||
    !canRenderParam ||
    !sectionImpl ||
    !codeObjImpl
  ) {
    return "Missing param binding.";
  }
  return null;
}

export function resolveParamEditabilityMessage(args: {
  canEditParams: boolean;
  codeParamBlocked: boolean;
}): string | null {
  const { canEditParams, codeParamBlocked } = args;
  if (!canEditParams) {
    return "Param edits are disabled by policy.";
  }
  if (codeParamBlocked) {
    return "Code params cannot be edited in app deployments. Bind a MetaControl param instead.";
  }
  return null;
}

export function resolveParamInputRuntimeContext(
  runtime: ReturnType<typeof useAppRuntime>,
) {
  return {
    canEditParams: runtime?.canEditParams ?? true,
    dataBindings: runtime?.dataBindings,
    defaultConfigId: runtime?.defaultConfigId ?? null,
  };
}

export function useAppConfigLoadState(
  resolvedConfigId: string | null,
  configState: AppConfigState | null,
) {
  const frontendHost = useAppSubsystemFrontendHost();
  const { mode: serverMode, modeResolved } = useAppSubsystemServerModeState();
  React.useEffect(() => {
    if (!resolvedConfigId) {
      return;
    }
    if (!modeResolved || serverMode !== "app" || configState) {
      return;
    }
    void ensureAppProjectConfigLoaded(frontendHost, resolvedConfigId);
  }, [configState, frontendHost, modeResolved, resolvedConfigId, serverMode]);
  return { modeResolved, serverMode };
}

export type ResolvedParamInputBindingResult = ResolvedParamBindingState & {
  statusMessage: string | null;
};

export function resolveParamInputBindingResult(args: {
  configState: AppConfigState | null;
  paramId: string | null;
  resolvedConfigId: string | null;
  sectionId: string | null;
}): ResolvedParamInputBindingResult {
  const { configState, paramId, resolvedConfigId, sectionId } = args;
  if (!configState || !sectionId || !paramId) {
    return {
      ...getParamBindingFailureState(),
      statusMessage: resolveParamInputStatusMessage({
        canRenderParam: false,
        codeObjImpl: null,
        configState,
        resolvedConfigId,
        sectionId,
        sectionImpl: null,
        paramId,
      }),
    };
  }
  const bindingState = resolveParamBindingState({
    configState,
    paramId,
    sectionId,
  });
  return {
    ...bindingState,
    statusMessage: resolveParamInputStatusMessage({
      ...bindingState,
      configState,
      resolvedConfigId,
      sectionId,
      paramId,
    }),
  };
}

export function resolveParamInputLabel(
  label: string | null,
  displayName: string | null,
  paramId: string,
): string {
  return label ?? displayName ?? paramId;
}

export function resolveCodeParamBlocked(args: {
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  modeResolved: boolean;
  serverMode: string | null | undefined;
}): boolean {
  return (
    args.modeResolved &&
    args.serverMode === "app" &&
    args.codeObjImpl.type === CodeObjTypeEnum.CodeParam
  );
}

export function resolveHeadingTheme(
  runtime: ReturnType<typeof useAppRuntime>,
  headingSizeKey: keyof AppThemeHeadingSizes,
) {
  const theme = runtime?.theme;
  if (!theme) {
    return {
      headingFont: undefined,
      headingLineHeight: undefined,
      headingSize: undefined,
    };
  }
  const typography = theme.typography;
  return {
    headingFont: theme.fonts?.heading ?? undefined,
    headingLineHeight: typography?.headingLineHeight,
    headingSize: typography?.headingSizes?.[headingSizeKey],
  };
}

export function resolveActionButtonRuntimeContext(
  runtime: ReturnType<typeof useAppRuntime>,
  actionName: string,
) {
  if (!runtime) {
    return {
      actionDefinition: null,
      allowDownloads: false,
      allowLinks: false,
      dataBindings: undefined,
      defaultConfigId: null,
    };
  }
  return {
    actionDefinition: runtime.actions[actionName] ?? null,
    allowDownloads: runtime.allowFileDownloads,
    allowLinks: runtime.allowExternalLinks,
    dataBindings: runtime.dataBindings,
    defaultConfigId: runtime.defaultConfigId ?? null,
  };
}

export function resolveActionButtonPresentation(args: {
  disabledReason: string | null;
  isDisabled: boolean;
  isRunAction: boolean;
  isRunning: boolean;
  resolvedLabel: string;
}) {
  const { disabledReason, isDisabled, isRunAction, isRunning, resolvedLabel } =
    args;
  return {
    buttonLabel: isRunning && isRunAction ? "Running..." : resolvedLabel,
    buttonTitle: isDisabled ? disabledReason ?? undefined : undefined,
  };
}
