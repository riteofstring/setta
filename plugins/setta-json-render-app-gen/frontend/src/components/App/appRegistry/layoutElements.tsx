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

export function ParamInputBlockContent(props: {
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
            baseValue={codeObjImpl.value ?? null}
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

export function Stack({ element, children }: AppComponentProps) {
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

export function Box({ element, children }: AppComponentProps) {
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

export function Grid({ element, children }: AppComponentProps) {
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

export function Container({ element, children }: AppComponentProps) {
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

export function Spacer({ element }: AppComponentProps) {
  const props = resolveElementProps(element);
  const breakpoint = useAppBreakpoint();
  const className = resolveStringProp(props.className);
  const size = resolveResponsiveNumberish(props.size, breakpoint) ?? 16;
  const axis = props.axis === "x" ? "x" : "y";
  const style: React.CSSProperties = { flexShrink: 0 };
  assignNumberishStyle(style, axis === "x" ? "width" : "height", size);
  return <div className={className} style={style} aria-hidden="true" />;
}

export function Card({ element, children }: AppComponentProps) {
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

export function ConfigScope({ element, children }: AppComponentProps) {
  const frontendHost = useAppSubsystemFrontendHost();
  const props = resolveElementProps(element);
  const configId = resolveNullableStringProp(props.configId);
  const className = resolveStringProp(props.className);
  React.useEffect(() => {
    if (configId) {
      void ensureAppProjectConfigLoaded(frontendHost, configId);
    }
  }, [configId, frontendHost]);
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

export function hasNonEmptyChildrenMetadata(
  element: RawElementProps | null,
): boolean {
  return Boolean(element?.children && element.children.length > 0);
}

export function Tabs({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const defaultKey = resolveNullableStringProp(props.defaultKey);
  const className = resolveStringProp(props.className);
  const tabs = React.useMemo(() => {
    return React.Children.toArray(children).filter(
      (child): child is TabChildElement =>
        React.isValidElement<AppComponentProps>(child),
    );
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

export function Tab({ element, children }: AppComponentProps) {
  const props = resolveElementProps(element);
  const className = resolveStringProp(props.className);
  return <div className={className}>{children}</div>;
}

export function Heading({ element }: AppComponentProps) {
  const props = resolveElementProps(element);
  const runtime = useAppRuntime();
  const text = resolveStringProp(props.text);
  const level = resolveHeadingLevel(props.level);
  const className = resolveStringProp(props.className);
  const { clampedLevel, headingSizeKey, sizeClass } =
    resolveHeadingPresentation(level);
  const { headingFont, headingLineHeight, headingSize } = resolveHeadingTheme(
    runtime,
    headingSizeKey,
  );
  const HeadingTag = `h${clampedLevel}` as "h1" | "h2" | "h3" | "h4";
  const style = buildTypographyStyle({
    fontFamily: headingFont ?? undefined,
    fontSize: headingSize,
    lineHeight: headingLineHeight,
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

export function resolveHeadingLevel(raw: unknown): number {
  return typeof raw === "number" ? raw : 2;
}

export function Text({ element }: AppComponentProps) {
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

export type ParamInputBlockContentProps = {
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  description: string | null;
  displayName: string | null;
  editabilityMessage: string | null;
  effectiveCanEditParams: boolean;
  label: string | null;
  paramId: string;
  resolvedConfigId: string;
  sectionId: string;
  sectionImpl: BaseSectionImplUnion;
};

export type ResolvedParamInputBlockState = {
  contentProps: ParamInputBlockContentProps | null;
  message: string | null;
};

export function resolveParamInputBlockState(args: {
  canEditParams: boolean;
  codeObjImpl: BaseChildlessCodeObjImplUnion | null;
  description: string | null;
  displayName: string | null;
  label: string | null;
  modeResolved: boolean;
  paramId: string | null;
  resolvedConfigId: string | null;
  sectionId: string | null;
  sectionImpl: BaseSectionImplUnion | null;
  serverMode: string | null | undefined;
  statusMessage: string | null;
}): ResolvedParamInputBlockState {
  if (args.statusMessage) {
    return { contentProps: null, message: args.statusMessage };
  }
  if (
    !args.codeObjImpl ||
    !args.paramId ||
    !args.resolvedConfigId ||
    !args.sectionId ||
    !args.sectionImpl
  ) {
    return {
      contentProps: null,
      message: "Missing param binding.",
    };
  }
  const codeParamBlocked = resolveCodeParamBlocked({
    codeObjImpl: args.codeObjImpl,
    modeResolved: args.modeResolved,
    serverMode: args.serverMode,
  });
  const effectiveCanEditParams = args.canEditParams && !codeParamBlocked;
  return {
    contentProps: {
      codeObjImpl: args.codeObjImpl,
      description: args.description,
      displayName: args.displayName,
      editabilityMessage: resolveParamEditabilityMessage({
        canEditParams: args.canEditParams,
        codeParamBlocked,
      }),
      effectiveCanEditParams,
      label: args.label,
      paramId: args.paramId,
      resolvedConfigId: args.resolvedConfigId,
      sectionId: args.sectionId,
      sectionImpl: args.sectionImpl,
    },
    message: null,
  };
}

export function ParamInputBlock({ element }: AppComponentProps) {
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
    resolvedConfigId ? state.configs[resolvedConfigId] ?? null : null,
  );
  const { modeResolved, serverMode } = useAppConfigLoadState(
    resolvedConfigId,
    configState,
  );
  const { canEditParams } = runtimeContext;
  const { codeObjImpl, displayName, sectionImpl, statusMessage } =
    resolveParamInputBindingResult({
      configState,
      paramId,
      resolvedConfigId,
      sectionId,
    });
  const { contentProps, message } = resolveParamInputBlockState({
    canEditParams,
    codeObjImpl,
    description,
    displayName,
    label,
    modeResolved,
    paramId,
    resolvedConfigId,
    sectionId,
    sectionImpl,
    serverMode,
    statusMessage,
  });
  if (!contentProps) {
    return renderAppBindingMessage(message ?? "Missing param binding.");
  }
  return <ParamInputBlockContent {...contentProps} />;
}
