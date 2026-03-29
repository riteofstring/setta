import type { Action } from "@json-render/core";
import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { DropdownInput } from "components/Params/ParamUIs/DropdownInput";
import { DropzoneInput } from "components/Params/ParamUIs/DropzoneInput";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { RotaryInput } from "components/Params/ParamUIs/RotaryInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { TextParamDateTimeInput } from "components/Params/ParamUIs/TextParamInput";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import "katex/dist/katex.min.css";
import _ from "lodash";
import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ensureAppProjectConfigLoaded } from "state/actions/app";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImpl,
  getCurrSectionVariantId,
  getParamDisplayNameIfPresent,
} from "state/actions/sectionInfos";
import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionParamLiteral,
} from "state/actions/websocketReceive";
import {
  useAppConfigs,
  useDecodedImages,
  useImages,
  useProjectState,
  useServerMode,
} from "state/definitions";
import { decodeExistingRawImages } from "state/hooks/artifacts";
import { useLocalPendingValue } from "state/hooks/utils";
import { bumpRemoteRevisions } from "state/utils/revisions";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_get_password_param_value,
  route_load_cached_image_artifacts,
  route_set_param_entered_value,
} from "utils/generatedEndpoints";
import type {
  DateParamCodeObjImpl,
  LoadCachedImageArtifactsResponse,
  TimeParamCodeObjImpl,
} from "utils/generatedTypes";
import {
  BaseChildlessCodeObjImplUnion,
  BaseSectionImplUnion,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  DropzoneModeEnum,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  LiteralDependencyValue,
  SectionTypeEnum,
  TextBlockFormatEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { shouldShowPasswordReveal } from "utils/paramValue";
import { buildTextBlockTypographyScale } from "utils/textBlockTypography";
import {
  resolveActionBinding,
  resolveActionType,
  resolveImageOutputBinding,
  resolveParamBinding,
  resolveTextOutputBinding,
} from "./appBindings";
import {
  AppConfigScopeContext,
  useAppActionState,
  useAppConfigScope,
  useAppRuntime,
} from "./appContext";
import { resolveResponsiveValue, useAppBreakpoint } from "./appResponsive";

type RawElementProps = {
  key?: unknown;
  type?: unknown;
  props?: Record<string, unknown>;
  children?: unknown;
};

type AppComponentProps = {
  element: RawElementProps & { props?: Record<string, unknown> };
  children?: React.ReactNode;
  onAction?: (action: Action) => void;
};

const ALIGN_CLASS: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const JUSTIFY_CLASS: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};

const BOX_BACKGROUND_BY_ROLE: Record<string, string> = {
  background: "var(--app-background)",
  surface: "var(--app-surface)",
  surfaceAlt: "var(--app-surface-alt)",
  card: "var(--app-card-bg)",
};

type LoadCachedImageArtifactsRouteResponse =
  ResponseDataAndStatus<LoadCachedImageArtifactsResponse>;

function resolveConfigId(
  bindingConfigId: string | null,
  runtimeConfigId: string | null,
  scopeConfigId: string | null,
) {
  return bindingConfigId ?? scopeConfigId ?? runtimeConfigId ?? null;
}

function resolveElementProps(
  element: AppComponentProps["element"],
): Record<string, unknown> {
  return element.props ?? {};
}

function resolveStringProp(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? raw : fallback;
}

function resolveNullableStringProp(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

function resolveNumberish(raw: unknown): number | string | null {
  return typeof raw === "number" || typeof raw === "string" ? raw : null;
}

function resolveResponsiveNumberish(
  raw: unknown,
  breakpoint: ReturnType<typeof useAppBreakpoint>,
): number | string | null {
  return resolveNumberish(resolveResponsiveValue(raw, breakpoint));
}

function resolveGapValue(
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

function assignNumberishStyle(
  style: React.CSSProperties,
  key: keyof React.CSSProperties,
  value: number | string | null,
): void {
  if (value === null) {
    return;
  }
  style[key] = typeof value === "number" ? `${value}px` : value;
}

function buildCardStyle(
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

function buildTypographyStyle(args: {
  fontFamily?: string;
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

function resolveMotionSettings(args: {
  delayMs: unknown;
  durationMs: unknown;
  easing: unknown;
  preset: unknown;
  themeMotion: {
    delayMs?: number;
    durationMs?: number;
    easing?: string;
    staggerMs?: number;
  } | null | undefined;
  staggerMs?: unknown;
}) {
  const { delayMs, durationMs, easing, preset, staggerMs, themeMotion } = args;
  const fallbackEasing =
    themeMotion?.easing ?? "cubic-bezier(0.16, 1, 0.3, 1)";
  return {
    delayMs: resolveNumber(delayMs, themeMotion?.delayMs ?? 0),
    durationMs: resolveNumber(durationMs, themeMotion?.durationMs ?? 220),
    easing: resolveEasing(easing, fallbackEasing),
    preset: resolveMotionPreset(preset),
    staggerMs: resolveNumber(staggerMs, themeMotion?.staggerMs ?? 70),
  };
}

type ResolvedTabDefinition = {
  child: React.ReactElement;
  hasContent: boolean;
  key: string;
  title: string;
};

function resolveTabKey(
  child: React.ReactElement,
  index: number,
  tabElement: RawElementProps | null,
): string {
  if (tabElement && typeof tabElement.key === "string" && tabElement.key) {
    return tabElement.key;
  }
  return typeof child.key === "string" ? child.key : `tab-${index}`;
}

function resolveTabTitle(
  index: number,
  tabElement: RawElementProps | null,
): string {
  if (
    tabElement?.props &&
    typeof tabElement.props.title === "string"
  ) {
    return tabElement.props.title;
  }
  return `Tab ${index + 1}`;
}

function resolveTabDefinition(
  child: React.ReactElement,
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

function CardHeader(props: {
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

const HEADING_KEY_BY_LEVEL = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } as const;
const HEADING_SIZE_CLASS_BY_LEVEL: Record<number, string> = {
  1: "[font-size:var(--app-text-2xl)]",
  2: "[font-size:var(--app-text-xl)]",
  3: "[font-size:var(--app-text-lg)]",
  4: "[font-size:var(--app-text-base)]",
};

function resolveHeadingPresentation(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 4);
  return {
    clampedLevel,
    headingSizeKey: HEADING_KEY_BY_LEVEL[clampedLevel],
    sizeClass:
      HEADING_SIZE_CLASS_BY_LEVEL[clampedLevel] ??
      "[font-size:var(--app-text-base)]",
  };
}

type ResolvedActionButtonState = {
  actionName: string;
  actionType: string | null;
  disabledReason: string | null;
  isDisabled: boolean;
  isRunAction: boolean;
  resolvedLabel: string;
};

function resolveActionButtonState(args: {
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
  const actionType = resolveActionType(actionName, actionDefinition ?? undefined);
  const isRunAction = actionName === "run" || actionType === "run";
  const isDownloadAction =
    actionType === "downloadArtifact" || actionType === "downloadBinary";
  const isExternalLink = actionType === "openExternalLink";
  const isDisabled = isRunAction
    ? !canRun || isRunning
    : isDownloadAction
      ? !allowDownloads
      : isExternalLink
        ? !allowLinks
        : false;
  const disabledReason = resolveActionDisabledReason({
    isDisabled,
    isDownloadAction,
    isExternalLink,
    isRunAction,
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

function resolveActionDisabledReason(args: {
  isDisabled: boolean;
  isDownloadAction: boolean;
  isExternalLink: boolean;
  isRunAction: boolean;
  runDisabledReason: string | null;
}): string | null {
  const {
    isDisabled,
    isDownloadAction,
    isExternalLink,
    isRunAction,
    runDisabledReason,
  } = args;
  if (isRunAction && isDisabled) {
    return runDisabledReason ?? "Run disabled";
  }
  if (isDownloadAction && isDisabled) {
    return "File downloads are disabled by policy.";
  }
  if (isExternalLink && isDisabled) {
    return "External links are disabled by policy.";
  }
  return null;
}

function buildActionParams(
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

type ResolvedParamBindingState = {
  canRenderParam: boolean;
  codeObjImpl: BaseChildlessCodeObjImplUnion | null;
  displayName: string | null;
  sectionImpl: BaseSectionImplUnion | null;
};

function getParamBindingFailureState(): ResolvedParamBindingState {
  return {
    canRenderParam: false,
    codeObjImpl: null,
    displayName: null,
    sectionImpl: null,
  };
}

function resolveCodeObjVariantIdForParam(args: {
  paramId: string;
  sectionImpl: BaseSectionImplUnion;
}): string | null {
  const { paramId, sectionImpl } = args;
  if (sectionImpl.type === SectionTypeEnum.MetaControl) {
    const controlParamId = sectionImpl.metaControlParamId;
    if (!controlParamId || controlParamId !== paramId) {
      return null;
    }
    return sectionImpl.codeObjVariantMap[paramId] ?? null;
  }
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    return null;
  }
  return sectionImpl.codeObjVariantMap[paramId] ?? null;
}

function resolveParamBindingState(args: {
  configState: NonNullable<ReturnType<typeof useAppConfigs>>;
  paramId: string;
  sectionId: string;
}): ResolvedParamBindingState {
  const { configState, paramId, sectionId } = args;
  const variantId =
    configState.previewSectionVariantMap[sectionId] ??
    configState.projectConfig.sectionVariantMap[sectionId];
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
  if (
    !hasValidParamCodeObjBinding(configState, codeObjVariantId, paramId)
  ) {
    return getParamBindingFailureState();
  }
  const previewActive =
    configState.previewSectionVariantMap[sectionId] !== undefined;
  const effectiveSectionImpl = getCurrEffectiveSectionImpl(
    configState,
    sectionId,
    previewActive,
  );
  const effectiveCodeObjImpl =
    getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
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

function hasValidParamCodeObjBinding(
  configState: NonNullable<ReturnType<typeof useAppConfigs>>,
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

function renderAppBindingMessage(message: string) {
  return (
    <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
      {message}
    </div>
  );
}

function resolveActionButtonClassName(isDisabled: boolean): string {
  return `rounded-full px-4 py-2 font-semibold transition-colors [font-size:var(--app-text-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-button-ring,_var(--app-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-background)] ${
    isDisabled
      ? "cursor-not-allowed bg-[color:var(--app-button-disabled-bg,_var(--app-surface-alt))] text-[color:var(--app-button-disabled-text,_var(--app-muted))]"
      : "bg-[color:var(--app-button-bg,_var(--app-accent))] text-[color:var(--app-button-text,_var(--app-accent-text))] hover:bg-[color:var(--app-button-bg-hover,_var(--app-accent-hover))]"
  }`;
}

function handleActionButtonClick(args: {
  actionName: string;
  isDisabled: boolean;
  onAction?: (action: Action) => void;
  resolvedConfigId: string | null;
  sectionId: string | null;
}): void {
  const { actionName, isDisabled, onAction, resolvedConfigId, sectionId } = args;
  if (!actionName || !onAction || isDisabled) {
    return;
  }
  onAction({
    name: actionName,
    params: buildActionParams(resolvedConfigId, sectionId),
  });
}

function resolveParamInputStatusMessage(args: {
  canRenderParam: boolean;
  codeObjImpl: BaseChildlessCodeObjImplUnion | null;
  configState: ReturnType<typeof useAppConfigs> | null;
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
  if (!sectionId || !paramId || !canRenderParam || !sectionImpl || !codeObjImpl) {
    return "Missing param binding.";
  }
  return null;
}

function resolveParamEditabilityMessage(args: {
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

function resolveParamInputRuntimeContext(runtime: ReturnType<typeof useAppRuntime>) {
  return {
    canEditParams: runtime?.canEditParams ?? true,
    dataBindings: runtime?.dataBindings,
    defaultConfigId: runtime?.defaultConfigId ?? null,
  };
}

type ResolvedParamInputBindingResult = ResolvedParamBindingState & {
  statusMessage: string | null;
};

function resolveParamInputBindingResult(args: {
  configState: ReturnType<typeof useAppConfigs> | null;
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

function resolveParamInputLabel(
  label: string | null,
  displayName: string | null,
  paramId: string,
): string {
  return label ?? displayName ?? paramId;
}

function resolveActionButtonRuntimeContext(
  runtime: ReturnType<typeof useAppRuntime>,
  actionName: string,
) {
  return {
    actionDefinition: runtime?.actions[actionName] ?? null,
    allowDownloads: runtime?.allowFileDownloads ?? false,
    allowLinks: runtime?.allowExternalLinks ?? false,
    dataBindings: runtime?.dataBindings,
    defaultConfigId: runtime?.defaultConfigId ?? null,
  };
}

function resolveActionButtonPresentation(args: {
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

function ParamInputBlockContent(props: {
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  displayName: string | null;
  editabilityMessage: string | null;
  effectiveCanEditParams: boolean;
  label: string | null;
  paramId: string;
  resolvedConfigId: string;
  sectionId: string;
  sectionImpl: BaseSectionImplUnion;
  description: string | null;
}) {
  const {
    codeObjImpl,
    description,
    displayName,
    editabilityMessage,
    effectiveCanEditParams,
    label,
    paramId,
    resolvedConfigId,
    sectionId,
    sectionImpl,
  } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold uppercase tracking-wide text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
          {resolveParamInputLabel(label, displayName, paramId)}
        </span>
        {description ? (
          <span className="text-[11px] text-[color:var(--app-muted)]">
            {description}
          </span>
        ) : null}
      </div>
      <div className="rounded-md border border-[color:var(--app-input-border,_var(--app-border))] bg-[color:var(--app-input-bg,_var(--app-surface))] px-2 py-1">
        <div
          className={
            effectiveCanEditParams ? "" : "pointer-events-none opacity-60"
          }
        >
          <AppParamInput
            configId={resolvedConfigId}
            sectionId={sectionId}
            paramInfoId={paramId}
            codeObjImpl={codeObjImpl}
            sectionImpl={sectionImpl}
            baseValue={codeObjImpl.value}
            canEditParams={effectiveCanEditParams}
          />
        </div>
        {editabilityMessage ? (
          <div className="mt-2 text-[11px] text-[color:var(--app-muted)]">
            {editabilityMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stack({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const breakpoint = useAppBreakpoint();
  const direction = props.direction === "row" ? "flex-row" : "flex-col";
  const gap = resolveGapValue(
    props.gap,
    breakpoint,
    runtime?.theme?.spacing?.stackGap,
  );
  const align = resolveStringProp(props.align, "stretch");
  const justify = resolveStringProp(props.justify, "start");
  const className = resolveStringProp(props.className);
  const alignClass = ALIGN_CLASS[align] ?? ALIGN_CLASS.stretch;
  const justifyClass = JUSTIFY_CLASS[justify] ?? JUSTIFY_CLASS.start;

  return (
    <div
      className={`flex ${direction} ${alignClass} ${justifyClass} ${className}`.trim()}
      style={{ gap }}
    >
      {children}
    </div>
  );
}

function Box({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const breakpoint = useAppBreakpoint();
  const className = resolveStringProp(props.className);
  const padding = resolveResponsiveNumberish(props.padding, breakpoint);
  const radius = resolveResponsiveNumberish(props.radius, breakpoint);
  const background = resolveStringProp(props.background, "none");
  const border = resolveStringProp(props.border, "none");
  const style: React.CSSProperties = {};
  assignNumberishStyle(style, "padding", padding);
  assignNumberishStyle(style, "borderRadius", radius);
  const resolvedBackground = BOX_BACKGROUND_BY_ROLE[background];
  if (resolvedBackground) {
    style.background = resolvedBackground;
  }
  const borderClassName =
    border === "border"
      ? "border border-[color:var(--app-border)]"
      : border === "card"
        ? "border border-[color:var(--app-card-border)]"
        : "";

  return (
    <div className={`${borderClassName} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

function Grid({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const breakpoint = useAppBreakpoint();
  const className = resolveStringProp(props.className);
  const gap = resolveGapValue(
    props.gap,
    breakpoint,
    runtime?.theme?.spacing?.stackGap,
  );
  const resolvedColumns = resolveResponsiveNumberish(props.columns, breakpoint);
  const rawColumns = typeof resolvedColumns === "number" ? resolvedColumns : 2;
  const columns = Math.min(Math.max(rawColumns, 1), 12);
  const align = resolveStringProp(props.align, "stretch");
  const justify = resolveStringProp(props.justify, "stretch");
  const itemAlignment: Record<string, React.CSSProperties["alignItems"]> = {
    start: "start",
    center: "center",
    end: "end",
    stretch: "stretch",
  };
  const itemJustify: Record<string, React.CSSProperties["justifyItems"]> = {
    start: "start",
    center: "center",
    end: "end",
    stretch: "stretch",
  };

  const style: React.CSSProperties = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap,
    alignItems: itemAlignment[align] ?? "stretch",
    justifyItems: itemJustify[justify] ?? "stretch",
  };

  return (
    <div className={`grid ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

function Container({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const breakpoint = useAppBreakpoint();
  const className = resolveStringProp(props.className);
  const maxWidth = resolveResponsiveNumberish(props.maxWidth, breakpoint);
  const style: React.CSSProperties = {};
  assignNumberishStyle(style, "maxWidth", maxWidth);
  return (
    <div className={`mx-auto w-full ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

function Spacer({ element }: AppComponentProps) {
  const props = resolveElementProps(element);
  const breakpoint = useAppBreakpoint();
  const className = resolveStringProp(props.className);
  const size = resolveResponsiveNumberish(props.size, breakpoint) ?? 16;
  const axis = props.axis === "x" ? "x" : "y";
  const style: React.CSSProperties = { flexShrink: 0 };
  assignNumberishStyle(style, axis === "x" ? "width" : "height", size);
  return <div className={className} style={style} aria-hidden="true" />;
}

function Card({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const title = resolveNullableStringProp(props.title);
  const description = resolveNullableStringProp(props.description);
  const className = resolveStringProp(props.className);
  const cardStyle = buildCardStyle(
    runtime?.theme?.spacing?.cardPadding,
    runtime?.theme?.spacing?.cardRadius,
  );

  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border border-[color:var(--app-card-border)] bg-[color:var(--app-card-bg)] p-4 text-[color:var(--app-text)] ${className}`.trim()}
      style={cardStyle}
    >
      <CardHeader description={description} title={title} />
      {children}
    </section>
  );
}

function ConfigScope({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const configId = resolveNullableStringProp(props.configId);
  const className = resolveStringProp(props.className);

  React.useEffect(() => {
    if (configId) {
      void ensureAppProjectConfigLoaded(configId);
    }
  }, [configId]);

  const content = className ? (
    <div className={className}>{children}</div>
  ) : (
    <>{children}</>
  );

  return (
    <AppConfigScopeContext.Provider value={{ configId }}>
      {content}
    </AppConfigScopeContext.Provider>
  );
}

function hasNonEmptyChildrenMetadata(element: RawElementProps | null): boolean {
  if (!element) {
    return false;
  }
  const childKeys = element.children;
  if (Array.isArray(childKeys)) {
    return childKeys.length > 0;
  }
  if (
    childKeys === null ||
    childKeys === undefined ||
    typeof childKeys === "boolean"
  ) {
    return false;
  }
  if (typeof childKeys === "string") {
    return childKeys.trim().length > 0;
  }
  return true;
}

function Tabs({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const defaultKey = resolveNullableStringProp(props.defaultKey);
  const className = resolveStringProp(props.className);
  const tabs = React.useMemo(() => {
    return React.Children.toArray(children).filter(React.isValidElement);
  }, [children]);
  const resolvedTabs = React.useMemo(() => {
    return tabs
      .map((child, index) => resolveTabDefinition(child, index))
      .filter((tab) => tab.hasContent);
  }, [tabs]);

  const [activeKey, setActiveKey] = React.useState(() => {
    if (defaultKey && resolvedTabs.some((tab) => tab.key === defaultKey)) {
      return defaultKey;
    }
    return resolvedTabs[0]?.key ?? null;
  });

  React.useEffect(() => {
    if (activeKey && resolvedTabs.some((tab) => tab.key === activeKey)) {
      return;
    }
    const fallbackKey = resolvedTabs[0]?.key ?? null;
    if (activeKey !== fallbackKey) {
      setActiveKey(fallbackKey);
    }
  }, [activeKey, resolvedTabs]);

  if (resolvedTabs.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`.trim()}>
      <div className="flex flex-wrap gap-2 border-b border-[color:var(--app-border)] pb-2">
        {resolvedTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveKey(tab.key)}
            className={`rounded-full px-3 py-1 font-semibold transition-colors [font-size:var(--app-text-xs)] ${
              tab.key === activeKey
                ? "bg-[color:var(--app-accent)] text-[color:var(--app-accent-text)] hover:bg-[color:var(--app-accent-hover)]"
                : "bg-[color:var(--app-surface)] text-[color:var(--app-muted)] hover:bg-[color:var(--app-surface-alt)]"
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div>
        {resolvedTabs.map((tab) =>
          tab.key === activeKey ? <div key={tab.key}>{tab.child}</div> : null,
        )}
      </div>
    </div>
  );
}

function Tab({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const className = resolveStringProp(props.className);
  return <div className={className}>{children}</div>;
}

function Heading({ element }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const text = resolveStringProp(props.text);
  const level = resolveHeadingLevel(props.level);
  const className = resolveStringProp(props.className);
  const headingFont = runtime?.theme?.fonts?.heading;
  const typography = runtime?.theme?.typography;
  const headingSizes = typography?.headingSizes;
  const { clampedLevel, headingSizeKey, sizeClass } =
    resolveHeadingPresentation(level);
  const headingSize = headingSizes?.[headingSizeKey];
  const HeadingTag = `h${clampedLevel}` as keyof JSX.IntrinsicElements;
  const style = buildTypographyStyle({
    fontFamily: headingFont ?? undefined,
    fontSize: headingSize,
    lineHeight: typography?.headingLineHeight,
  });

  return (
    <HeadingTag
      className={`font-semibold tracking-tight text-[color:var(--app-text)] ${sizeClass} ${className}`.trim()}
      style={style}
    >
      {text}
    </HeadingTag>
  );
}

function resolveHeadingLevel(raw: unknown): number {
  return typeof raw === "number" ? raw : 2;
}

function Text({ element }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const text = resolveStringProp(props.text);
  const className = resolveStringProp(props.className);
  const typography = runtime?.theme?.typography;
  const style = buildTypographyStyle({
    fontSize: typography?.bodySize,
    lineHeight: typography?.bodyLineHeight,
  });

  return (
    <p
      className={`text-[color:var(--app-muted)] [font-size:var(--app-text-sm)] ${className}`.trim()}
      style={style}
    >
      {text}
    </p>
  );
}

function ParamInputBlock({ element }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const scope = useAppConfigScope();
  const runtimeContext = resolveParamInputRuntimeContext(runtime);
  const {
    configId: bindingConfigId,
    sectionId,
    paramId,
    label,
    description,
  } = resolveParamBinding(props, runtimeContext.dataBindings);
  const resolvedConfigId = resolveConfigId(
    bindingConfigId,
    runtimeContext.defaultConfigId,
    scope.configId,
  );
  const configState = useAppConfigs((state) =>
    resolvedConfigId ? state.configs[resolvedConfigId] : null,
  );
  const serverMode = useServerMode((x) => x.mode);
  const modeResolved = useServerMode((x) => x.modeResolved);
  const { canEditParams } = runtimeContext;

  React.useEffect(() => {
    if (!resolvedConfigId) {
      return;
    }
    if (!modeResolved || serverMode !== "app") {
      return;
    }
    if (!configState) {
      void ensureAppProjectConfigLoaded(resolvedConfigId);
    }
  }, [configState, modeResolved, resolvedConfigId, serverMode]);

  const { codeObjImpl, displayName, sectionImpl, statusMessage } =
    resolveParamInputBindingResult({
      configState,
      paramId,
      resolvedConfigId,
      sectionId,
    });
  if (statusMessage) {
    return renderAppBindingMessage(statusMessage);
  }

  const codeParamBlocked =
    modeResolved &&
    serverMode === "app" &&
    codeObjImpl.type === CodeObjTypeEnum.CodeParam;
  const effectiveCanEditParams = canEditParams && !codeParamBlocked;
  const editabilityMessage = resolveParamEditabilityMessage({
    canEditParams,
    codeParamBlocked,
  });

  return (
    <ParamInputBlockContent
      codeObjImpl={codeObjImpl}
      description={description}
      displayName={displayName}
      editabilityMessage={editabilityMessage}
      effectiveCanEditParams={effectiveCanEditParams}
      label={label}
      paramId={paramId}
      resolvedConfigId={resolvedConfigId}
      sectionId={sectionId}
      sectionImpl={sectionImpl}
    />
  );
}

type AppParamInputProps = {
  configId: string;
  sectionId: string;
  paramInfoId: string;
  baseValue: string | number | boolean | null;
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  sectionImpl: BaseSectionImplUnion;
  canEditParams: boolean;
};

function AppParamInput({
  configId,
  sectionId,
  paramInfoId,
  baseValue,
  codeObjImpl,
  sectionImpl,
  canEditParams,
}: AppParamInputProps) {
  const isPasswordParam = codeObjImpl.type === CodeObjTypeEnum.PasswordParam;
  const sectionVariantId = useProjectState((x) =>
    getCurrSectionVariantId(x, sectionId),
  );
  const [value, setPendingValue] = useLocalPendingValue(
    baseValue,
    undefined,
    `${sectionVariantId}:${paramInfoId}`,
  );
  const [isRevealing, setIsRevealing] = React.useState(false);

  function onChange(nextValue, options?: { skipBackendUpdate?: boolean }) {
    const nextValueStr = _.toString(nextValue);
    setPendingValue(nextValueStr);
    sendRealtimeSectionParamLiteral(
      sectionId,
      paramInfoId,
      nextValueStr,
      configId,
    );
    if (options?.skipBackendUpdate) {
      return;
    }
    if (isPasswordParam) {
      debouncedSetPasswordParamValue(
        configId,
        sectionId,
        sectionVariantId,
        paramInfoId,
        nextValueStr,
      );
      return;
    }
    debouncedSetParamEnteredValue(
      configId,
      sectionId,
      sectionVariantId,
      paramInfoId,
      nextValueStr,
    );
  }

  function onRevealPassword() {
    if (!isPasswordParam || isRevealing || value !== "") {
      return;
    }
    setIsRevealing(true);
    route_get_password_param_value({
      projectConfigId: configId,
      sectionId,
      paramInfoId,
    })
      .then((response) => {
        if (res200(response)) {
          setPendingValue(response.data.value);
        }
      })
      .finally(() => {
        setIsRevealing(false);
      });
  }

  function onDropzoneStateless(attachments: DropzoneStatelessAttachment[]) {
    if (attachments.length === 0) {
      return;
    }
    const dependencyKey = {
      type: DependencyKeyTypeEnum.SectionParam,
      sectionId,
      codeObjId: paramInfoId,
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
        paramInfoId,
        attachments: metadataAttachments,
      }),
      type: DependencyValueTypeEnum.Literal,
    };
    sendRealtimeDependencyEvent(
      {
        dependencyKey,
        payload: metadataPayload,
      },
      configId,
    );
    for (const attachment of attachments) {
      if (attachment.kind !== "file") {
        continue;
      }
      sendRealtimeDependencyEvent(
        {
          dependencyKey,
          payload: {
            payload: {
              contentId: attachment.contentId,
              byteLength: attachment.byteLength,
              mimeType: attachment.mimeType,
            },
            type: DependencyValueTypeEnum.Binary,
          },
          binaryPayload: attachment.binaryPayload,
        },
        configId,
      );
    }
  }

  return (
    <AppParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onDropzoneStateless={onDropzoneStateless}
      onRevealPassword={onRevealPassword}
      isPasswordRevealPending={isRevealing}
      codeObjImpl={codeObjImpl}
      sectionImpl={sectionImpl}
      canEditParams={canEditParams}
    />
  );
}

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

const APP_PARAM_BORDER_CLASS =
  "section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]";
const APP_PARAM_TEXT_INPUT_CLASS =
  "nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-text)]";
const APP_PARAM_TEXT_INPUT_ACTIVE_CLASS = "cursor-text select-text";

type AppParamRenderContext = {
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  configLanguage: ConfigLanguageEnum;
  defaultVal: string | number | boolean | null;
  isDisabled: boolean;
  isPasswordRevealPending: boolean;
  onChange: AppParamUIProps["onChange"];
  onDropzoneStateless?: AppParamUIProps["onDropzoneStateless"];
  onEscape: () => void;
  onRevealPassword?: () => void;
  paramInfoId: string;
  passwordPlaceholder?: string;
  sectionId: string;
  showPasswordReveal: boolean;
  stringValue: string;
  value: string | number | boolean | null;
};

function noopAppParamEscape() {}

function expectDateParamImpl(
  codeObjImpl: BaseChildlessCodeObjImplUnion,
): DateParamCodeObjImpl {
  if (codeObjImpl.type !== CodeObjTypeEnum.DateParam) {
    throw new TypeError(
      `Expected DateParam impl, got ${codeObjImpl.type ?? "unknown"}.`,
    );
  }
  return codeObjImpl;
}

function expectTimeParamImpl(
  codeObjImpl: BaseChildlessCodeObjImplUnion,
): TimeParamCodeObjImpl {
  if (codeObjImpl.type !== CodeObjTypeEnum.TimeParam) {
    throw new TypeError(
      `Expected TimeParam impl, got ${codeObjImpl.type ?? "unknown"}.`,
    );
  }
  return codeObjImpl;
}

function resolveParamConfigLanguage(
  sectionImpl: BaseSectionImplUnion,
): ConfigLanguageEnum {
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    return ConfigLanguageEnum.python;
  }
  return sectionImpl.configLanguage ?? ConfigLanguageEnum.python;
}

function resolveParamRenderContext(
  props: AppParamUIProps,
): AppParamRenderContext {
  const {
    canEditParams,
    codeObjImpl,
    isPasswordRevealPending,
    onChange,
    onDropzoneStateless,
    onRevealPassword,
    paramInfoId,
    sectionId,
    sectionImpl,
    value,
  } = props;
  const isFrozen = isBaseSectionWithParamsImpl(sectionImpl)
    ? sectionImpl.isFrozen
    : false;
  const defaultVal = "defaultVal" in codeObjImpl ? codeObjImpl.defaultVal : null;
  const isPasswordParam = codeObjImpl.type === CodeObjTypeEnum.PasswordParam;
  const passwordHasSecret =
    isPasswordParam && "hasSecret" in codeObjImpl
      ? codeObjImpl.hasSecret
      : false;
  const stringValue = _.toString(value ?? "");
  return {
    codeObjImpl,
    configLanguage: resolveParamConfigLanguage(sectionImpl),
    defaultVal,
    isDisabled: !canEditParams || isFrozen,
    isPasswordRevealPending: Boolean(isPasswordRevealPending),
    onChange,
    onDropzoneStateless,
    onEscape: noopAppParamEscape,
    onRevealPassword,
    paramInfoId,
    passwordPlaceholder:
      passwordHasSecret && stringValue === "" ? "Saved" : undefined,
    sectionId,
    showPasswordReveal: shouldShowPasswordReveal({
      value: stringValue,
      hasSecret: passwordHasSecret,
    }),
    stringValue,
    value,
  };
}

function resolveParamNumericRange(codeObjImpl: BaseChildlessCodeObjImplUnion) {
  return {
    min: "min" in codeObjImpl ? codeObjImpl.min ?? 0 : 0,
    max: "max" in codeObjImpl ? codeObjImpl.max ?? 100 : 100,
    step: "step" in codeObjImpl ? codeObjImpl.step ?? 1 : 1,
  };
}

function resolveDropdownParamValue(
  value: string | number | boolean | null,
  stringValue: string,
): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value !== null && value !== undefined) {
    return stringValue;
  }
  return null;
}

function resolveDropzoneSettings(codeObjImpl: BaseChildlessCodeObjImplUnion) {
  return {
    mode: "mode" in codeObjImpl ? codeObjImpl.mode ?? DropzoneModeEnum.STATEFUL : DropzoneModeEnum.STATEFUL,
    maxAttachments:
      "maxAttachments" in codeObjImpl
        ? codeObjImpl.maxAttachments ?? null
        : null,
    placeholder:
      "placeholder" in codeObjImpl ? codeObjImpl.placeholder ?? undefined : undefined,
  };
}

function renderCodeMirrorParam(context: AppParamRenderContext) {
  const { configLanguage, defaultVal, isDisabled, onChange, onEscape, paramInfoId, sectionId, stringValue } =
    context;
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

function renderTimeParam(context: AppParamRenderContext) {
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

function renderDateParam(context: AppParamRenderContext) {
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

function renderSliderParam(context: AppParamRenderContext) {
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

function renderRotaryParam(context: AppParamRenderContext) {
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

function renderSwitchParam(context: AppParamRenderContext) {
  return (
    <SwitchInput
      value={context.value ?? false}
      defaultVal={context.defaultVal ?? undefined}
      onChange={(next) => context.onChange(next)}
      onEscape={context.onEscape}
      isDisabled={context.isDisabled}
      outerDivClassName="section-value flex justify-self-start self-center"
      rootThemeClassName="bg-[color:var(--app-surface-alt)] data-[state='checked']:bg-[color:var(--app-accent)] focus-visible:ring-[color:var(--app-accent)]"
      thumbThemeClassName="bg-[color:var(--app-surface)]"
    />
  );
}

function renderColorPickerParam(context: AppParamRenderContext) {
  const colorChoices =
    "colorChoices" in context.codeObjImpl ? context.codeObjImpl.colorChoices : [];
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

function renderDropdownParam(context: AppParamRenderContext) {
  const choices = "choices" in context.codeObjImpl ? context.codeObjImpl.choices : [];
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

function renderPasswordParam(context: AppParamRenderContext) {
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

function renderDropzoneParam(context: AppParamRenderContext) {
  const { maxAttachments, mode, placeholder } = resolveDropzoneSettings(
    context.codeObjImpl,
  );
  return (
    <DropzoneInput
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

const APP_PARAM_RENDERERS: Partial<
  Record<CodeObjTypeEnum, (context: AppParamRenderContext) => React.ReactNode>
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

function AppParamUI(props: AppParamUIProps) {
  const context = resolveParamRenderContext(props);
  const renderer = APP_PARAM_RENDERERS[context.codeObjImpl.type];
  if (!renderer) {
    return null;
  }
  return renderer(context);
}

const notifyParamUpdateError = _.throttle(
  (message: string) => {
    addTemporaryNotification(message);
  },
  2500,
  { trailing: false },
);

const debouncedSetParamEnteredValue = _.debounce(
  (
    configId: string,
    sectionId: string,
    sectionVariantId: string,
    paramInfoId: string,
    value: string,
  ) => {
    route_set_param_entered_value({
      projectConfigId: configId,
      sectionId,
      sectionVariantId,
      paramInfoId,
      value,
    }).then((response) => {
      if (res200(response)) {
        return;
      }
      notifyParamUpdateError(
        response.status === 403
          ? "This parameter cannot be edited in app deployments."
          : "Failed to update parameter.",
      );
    });
  },
  50,
);

const debouncedSetPasswordParamValue = _.debounce(
  (
    configId: string,
    sectionId: string,
    sectionVariantId: string,
    paramInfoId: string,
    value: string,
  ) => {
    route_set_param_entered_value({
      projectConfigId: configId,
      sectionId,
      sectionVariantId,
      paramInfoId,
      value,
    }).then((response) => {
      if (res200(response)) {
        return;
      }
      notifyParamUpdateError(
        response.status === 403
          ? "This parameter cannot be edited in app deployments."
          : "Failed to update parameter.",
      );
    });
  },
  50,
);

function ActionButton({ element, onAction }: AppComponentProps) {
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
  } =
    resolveActionButtonState({
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

function TextOutput({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const scope = useAppConfigScope();
  const { configId, sectionId, label } = resolveTextOutputBinding(
    props,
    runtime?.dataBindings,
  );
  const resolvedConfigId = resolveConfigId(
    configId,
    runtime?.defaultConfigId ?? null,
    scope.configId,
  );
  const configState = useAppConfigs((state) =>
    resolvedConfigId ? state.configs[resolvedConfigId] : null,
  );
  const serverMode = useServerMode((x) => x.mode);
  const modeResolved = useServerMode((x) => x.modeResolved);

  React.useEffect(() => {
    if (!resolvedConfigId) {
      return;
    }
    if (!modeResolved || serverMode !== "app") {
      return;
    }
    if (!configState) {
      void ensureAppProjectConfigLoaded(resolvedConfigId);
    }
  }, [configState, modeResolved, resolvedConfigId, serverMode]);

  const textData = React.useMemo(() => {
    if (!resolvedConfigId || !sectionId || !configState) {
      return null;
    }
    const variantId =
      configState.previewSectionVariantMap[sectionId] ??
      configState.projectConfig.sectionVariantMap[sectionId];
    if (!variantId) {
      return null;
    }
    const variant = configState.sectionVariants[variantId];
    if (!variant) {
      return null;
    }
    const impl = configState.sectionImpls[variant.impl];
    if (!impl) {
      return null;
    }
    const core = configState.sections[sectionId];
    if (!core) {
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
      text: effectiveImpl.text,
      format: effectiveImpl.format,
      masterFontSizePx: effectiveImpl.masterFontSizePx,
    };
  }, [configState, resolvedConfigId, sectionId]);

  if (!resolvedConfigId || !sectionId || !textData) {
    return (
      <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
        Missing text output.
      </div>
    );
  }

  const { text, format, masterFontSizePx } = textData;
  const typography = buildTextBlockTypographyScale(masterFontSizePx);
  const markdownTypographyStyle: React.CSSProperties = {
    "--setta-textblock-body-size": `${typography.bodyPx}px`,
    "--setta-textblock-code-size": `${typography.codePx}px`,
    "--setta-textblock-h1-size": `${typography.h1Px}px`,
    "--setta-textblock-h2-size": `${typography.h2Px}px`,
    "--setta-textblock-h3-size": `${typography.h3Px}px`,
    "--setta-textblock-h4-size": `${typography.h4Px}px`,
    "--setta-textblock-h5-size": `${typography.h5Px}px`,
    "--setta-textblock-h6-size": `${typography.h6Px}px`,
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-3">
      {label && (
        <div className="font-semibold uppercase tracking-wide text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
          {label}
        </div>
      )}
      {format === TextBlockFormatEnum.Markdown ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          className="prose max-w-none text-[color:var(--app-text)] dark:prose-invert prose-h1:text-[length:var(--setta-textblock-h1-size)] prose-h2:text-[length:var(--setta-textblock-h2-size)] prose-h3:text-[length:var(--setta-textblock-h3-size)] prose-h4:text-[length:var(--setta-textblock-h4-size)] prose-h5:text-[length:var(--setta-textblock-h5-size)] prose-h6:text-[length:var(--setta-textblock-h6-size)] prose-p:text-[length:var(--setta-textblock-body-size)] prose-code:text-[length:var(--setta-textblock-code-size)] prose-pre:text-[length:var(--setta-textblock-code-size)] prose-li:text-[length:var(--setta-textblock-body-size)]"
          style={markdownTypographyStyle}
          components={{ code: CodeBlock }}
        >
          {text}
        </ReactMarkdown>
      ) : (
        <pre
          className="whitespace-pre-wrap text-[color:var(--app-text)]"
          style={{ fontSize: `${typography.bodyPx}px` }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

async function loadCachedImagesById(paths: Array<string>) {
  if (paths.length === 0) {
    return;
  }
  const res: LoadCachedImageArtifactsRouteResponse =
    await route_load_cached_image_artifacts({ paths });
  if (res200(res)) {
    useImages.setState((state) => {
      const next = { ...state.x };
      const changedIds: Array<string> = [];
      for (const img of res.data) {
        if (img) {
          const existing = state.x[img.id];
          if (!existing) {
            next[img.id] = img;
            changedIds.push(img.id);
          }
        }
      }
      if (changedIds.length === 0) {
        return state;
      }
      const revisions = bumpRemoteRevisions(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        changedIds,
      );
      return {
        x: next,
        ...revisions,
      };
    });
  }
}

function useImageArtifactById(artifactId: string | null) {
  const imageArtifact = useImages((state) =>
    artifactId ? state.x[artifactId] : null,
  );
  React.useEffect(() => {
    if (!artifactId || imageArtifact) {
      return;
    }
    void loadCachedImagesById([artifactId]);
  }, [artifactId, imageArtifact]);
  return imageArtifact;
}

function ImageOutput({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const { artifactId, alt } = resolveImageOutputBinding(
    props,
    runtime?.dataBindings,
  );
  const resolvedAlt = alt ?? "App output image";
  const imageArtifact = useImageArtifactById(artifactId);
  const decodedImage = useDecodedImages((state) =>
    imageArtifact ? state.x[imageArtifact.id] : null,
  );

  React.useEffect(() => {
    if (!imageArtifact) {
      return;
    }
    const currentContentId = imageArtifact.value.contentId;
    if (!decodedImage || decodedImage.dataset.contentId !== currentContentId) {
      void decodeExistingRawImages([imageArtifact.id]);
    }
  }, [imageArtifact, decodedImage]);

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

function Divider({ element }: AppComponentProps) {
  const props = resolveElementProps(element);
  const className = resolveStringProp(props.className);
  return (
    <hr className={`border-[color:var(--app-border)] ${className}`.trim()} />
  );
}

const MOTION_PRESETS = new Set([
  "none",
  "fadeIn",
  "slideUp",
  "slideDown",
  "slideLeft",
  "slideRight",
  "scaleIn",
]);

function resolveMotionPreset(raw: unknown): string {
  if (typeof raw === "string" && MOTION_PRESETS.has(raw)) {
    return raw;
  }
  return "fadeIn";
}

function resolveNumber(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || Number.isNaN(raw) || !Number.isFinite(raw)) {
    return fallback;
  }
  return raw;
}

function resolveEasing(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }
  return fallback;
}

function Motion({ element, children }: AppComponentProps) {
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

function Stagger({ element, children }: AppComponentProps) {
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

export const appRegistry: Record<
  string,
  React.ComponentType<AppComponentProps>
> = {
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
