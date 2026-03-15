import React from "react";
import { ensureAppProjectConfigLoaded } from "state/actions/appDeploymentState";
import { resolveActionBinding, resolveActionType } from "./appBindings";
import {
  AppConfigScopeContext,
  useAppActionState,
  useAppConfigScope,
  useAppRuntime,
} from "./appContext";
import { ImageOutputBlock, TextOutputBlock } from "./appRegistryOutputBlocks";
import { ParamInputBlock } from "./appRegistryParamInput";
import {
  type AppComponentProps,
  type RawElementProps,
  resolveConfigId,
} from "./appRegistryShared";
import { resolveResponsiveValue, useAppBreakpoint } from "./appResponsive";

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

function Stack({ element, children }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const breakpoint = useAppBreakpoint();
  const direction = props.direction === "row" ? "flex-row" : "flex-col";
  const themeGap = runtime?.theme?.spacing?.stackGap;
  const resolvedGap = resolveResponsiveValue(props.gap, breakpoint);
  const gap =
    typeof resolvedGap === "number" || typeof resolvedGap === "string"
      ? resolvedGap
      : typeof themeGap === "number" || typeof themeGap === "string"
        ? themeGap
        : 16;
  const align = typeof props.align === "string" ? props.align : "stretch";
  const justify = typeof props.justify === "string" ? props.justify : "start";
  const className = typeof props.className === "string" ? props.className : "";
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
  const props = element.props ?? {};
  const breakpoint = useAppBreakpoint();
  const className = typeof props.className === "string" ? props.className : "";
  const resolvedPadding = resolveResponsiveValue(props.padding, breakpoint);
  const padding =
    typeof resolvedPadding === "number" || typeof resolvedPadding === "string"
      ? resolvedPadding
      : null;
  const resolvedRadius = resolveResponsiveValue(props.radius, breakpoint);
  const radius =
    typeof resolvedRadius === "number" || typeof resolvedRadius === "string"
      ? resolvedRadius
      : null;
  const background =
    typeof props.background === "string" ? props.background : "none";
  const border = typeof props.border === "string" ? props.border : "none";

  const style: React.CSSProperties = {};
  if (padding !== null) {
    style.padding = typeof padding === "number" ? `${padding}px` : padding;
  }
  if (radius !== null) {
    style.borderRadius = typeof radius === "number" ? `${radius}px` : radius;
  }

  const resolvedBackground = BOX_BACKGROUND_BY_ROLE[background];
  if (resolvedBackground) {
    style.background = resolvedBackground;
  }

  let borderClassName = "";
  if (border === "border") {
    borderClassName = "border border-[color:var(--app-border)]";
  } else if (border === "card") {
    borderClassName = "border border-[color:var(--app-card-border)]";
  }

  return (
    <div className={`${borderClassName} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

function Grid({ element, children }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const breakpoint = useAppBreakpoint();
  const className = typeof props.className === "string" ? props.className : "";
  const themeGap = runtime?.theme?.spacing?.stackGap;
  const resolvedGap = resolveResponsiveValue(props.gap, breakpoint);
  const gap =
    typeof resolvedGap === "number" || typeof resolvedGap === "string"
      ? resolvedGap
      : typeof themeGap === "number" || typeof themeGap === "string"
        ? themeGap
        : 16;

  const resolvedColumns = resolveResponsiveValue(props.columns, breakpoint);
  const rawColumns = typeof resolvedColumns === "number" ? resolvedColumns : 2;
  const columns = Math.min(Math.max(rawColumns, 1), 12);

  const align = typeof props.align === "string" ? props.align : "stretch";
  const justify = typeof props.justify === "string" ? props.justify : "stretch";
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
  const props = element.props ?? {};
  const breakpoint = useAppBreakpoint();
  const className = typeof props.className === "string" ? props.className : "";
  const resolvedMaxWidth = resolveResponsiveValue(props.maxWidth, breakpoint);
  const maxWidth =
    typeof resolvedMaxWidth === "number" || typeof resolvedMaxWidth === "string"
      ? resolvedMaxWidth
      : null;
  const style: React.CSSProperties = {};
  if (maxWidth !== null) {
    style.maxWidth = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  }
  return (
    <div className={`mx-auto w-full ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

function Spacer({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const breakpoint = useAppBreakpoint();
  const className = typeof props.className === "string" ? props.className : "";
  const resolvedSize = resolveResponsiveValue(props.size, breakpoint);
  const size =
    typeof resolvedSize === "number" || typeof resolvedSize === "string"
      ? resolvedSize
      : 16;
  const axis = props.axis === "x" ? "x" : "y";
  const style: React.CSSProperties = { flexShrink: 0 };
  if (axis === "x") {
    style.width = typeof size === "number" ? `${size}px` : size;
  } else {
    style.height = typeof size === "number" ? `${size}px` : size;
  }
  return <div className={className} style={style} aria-hidden="true" />;
}

function Card({ element, children }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const title = typeof props.title === "string" ? props.title : null;
  const description =
    typeof props.description === "string" ? props.description : null;
  const className = typeof props.className === "string" ? props.className : "";
  const cardPadding = runtime?.theme?.spacing?.cardPadding;
  const cardRadius = runtime?.theme?.spacing?.cardRadius;
  const cardStyle: React.CSSProperties = {};
  if (typeof cardPadding === "number") {
    cardStyle.padding = `${cardPadding}px`;
  } else if (typeof cardPadding === "string") {
    cardStyle.padding = cardPadding;
  }
  if (typeof cardRadius === "number") {
    cardStyle.borderRadius = `${cardRadius}px`;
  } else if (typeof cardRadius === "string") {
    cardStyle.borderRadius = cardRadius;
  }
  cardStyle.boxShadow = "var(--app-card-shadow, 0 1px 2px 0 rgb(0 0 0 / 0.05))";

  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border border-[color:var(--app-card-border)] bg-[color:var(--app-card-bg)] p-4 text-[color:var(--app-text)] ${className}`.trim()}
      style={cardStyle}
    >
      {(title || description) && (
        <header className="flex flex-col gap-1">
          {title && (
            <h3 className="font-semibold text-[color:var(--app-text)] [font-size:var(--app-text-sm)]">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
              {description}
            </p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

function ConfigScope({ element, children }: AppComponentProps) {
  const props = element.props ?? {};
  const configId = typeof props.configId === "string" ? props.configId : null;
  const className = typeof props.className === "string" ? props.className : "";

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
  const props = element.props ?? {};
  const defaultKey =
    typeof props.defaultKey === "string" ? props.defaultKey : null;
  const className = typeof props.className === "string" ? props.className : "";
  const tabs = React.useMemo(() => {
    return React.Children.toArray(children).filter(React.isValidElement);
  }, [children]);
  const resolvedTabs = React.useMemo(() => {
    return tabs
      .map((child, index) => {
        const tabElement = child.props?.element ?? null;
        const tabKey =
          (tabElement &&
            typeof tabElement.key === "string" &&
            tabElement.key) ||
          (typeof child.key === "string" ? child.key : `tab-${index}`);
        const title =
          tabElement?.props && typeof tabElement.props.title === "string"
            ? tabElement.props.title
            : `Tab ${index + 1}`;
        const hasContent =
          hasNonEmptyChildrenMetadata(tabElement) ||
          React.Children.count(child.props?.children) > 0;
        return { key: tabKey, title, child, hasContent };
      })
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
  const props = element.props ?? {};
  const className = typeof props.className === "string" ? props.className : "";
  return <div className={className}>{children}</div>;
}

function Heading({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const text = typeof props.text === "string" ? props.text : "";
  const level = typeof props.level === "number" ? props.level : 2;
  const className = typeof props.className === "string" ? props.className : "";
  const headingFont = runtime?.theme?.fonts?.heading;
  const typography = runtime?.theme?.typography;
  const headingSizes = typography?.headingSizes;
  const clampedLevel = Math.min(Math.max(level, 1), 4);
  const headingKeyByLevel = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } as const;
  const headingSizeKey = headingKeyByLevel[clampedLevel];
  const headingSize = headingSizes?.[headingSizeKey];
  const HeadingTag = `h${clampedLevel}` as keyof JSX.IntrinsicElements;
  const sizeClassByLevel: Record<number, string> = {
    1: "[font-size:var(--app-text-2xl)]",
    2: "[font-size:var(--app-text-xl)]",
    3: "[font-size:var(--app-text-lg)]",
    4: "[font-size:var(--app-text-base)]",
  };
  const sizeClass =
    sizeClassByLevel[clampedLevel] ?? "[font-size:var(--app-text-base)]";

  const style: React.CSSProperties = {};
  if (headingFont) {
    style.fontFamily = headingFont;
  }
  if (typeof headingSize === "number" || typeof headingSize === "string") {
    style.fontSize = headingSize;
  }
  if (
    typeof typography?.headingLineHeight === "number" ||
    typeof typography?.headingLineHeight === "string"
  ) {
    style.lineHeight = typography.headingLineHeight;
  }

  return (
    <HeadingTag
      className={`font-semibold tracking-tight text-[color:var(--app-text)] ${sizeClass} ${className}`.trim()}
      style={Object.keys(style).length > 0 ? style : undefined}
    >
      {text}
    </HeadingTag>
  );
}

function Text({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const text = typeof props.text === "string" ? props.text : "";
  const className = typeof props.className === "string" ? props.className : "";
  const typography = runtime?.theme?.typography;
  const style: React.CSSProperties = {};
  if (
    typeof typography?.bodySize === "number" ||
    typeof typography?.bodySize === "string"
  ) {
    style.fontSize = typography.bodySize;
  }
  if (
    typeof typography?.bodyLineHeight === "number" ||
    typeof typography?.bodyLineHeight === "string"
  ) {
    style.lineHeight = typography.bodyLineHeight;
  }

  return (
    <p
      className={`text-[color:var(--app-muted)] [font-size:var(--app-text-sm)] ${className}`.trim()}
      style={Object.keys(style).length > 0 ? style : undefined}
    >
      {text}
    </p>
  );
}

function ActionButton({ element, onAction }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const scope = useAppConfigScope();
  const { configId, action, sectionId, label } = resolveActionBinding(
    props,
    runtime?.dataBindings,
  );
  const resolvedConfigId = resolveConfigId(
    configId,
    runtime?.defaultConfigId ?? null,
    scope.configId,
  );
  const resolvedLabel = label ?? "Run";
  const actionName = action ?? "";
  const actionDefinition = runtime?.actions[actionName] ?? null;
  const actionType = resolveActionType(
    actionName,
    actionDefinition ?? undefined,
  );
  const { canRun, isRunning, runDisabledReason } = useAppActionState();
  const isRunAction = actionName === "run" || actionType === "run";
  const isDownloadAction =
    actionType === "downloadArtifact" || actionType === "downloadBinary";
  const isExternalLink = actionType === "openExternalLink";
  const allowDownloads = runtime?.allowFileDownloads ?? false;
  const allowLinks = runtime?.allowExternalLinks ?? false;
  let isDisabled = false;
  if (isRunAction) {
    isDisabled = !canRun || isRunning;
  } else if (isDownloadAction) {
    isDisabled = !allowDownloads;
  } else if (isExternalLink) {
    isDisabled = !allowLinks;
  }

  let disabledReason: string | null = null;
  if (isRunAction && isDisabled) {
    disabledReason = runDisabledReason ?? "Run disabled";
  } else if (isDownloadAction && isDisabled) {
    disabledReason = "File downloads are disabled by policy.";
  } else if (isExternalLink && isDisabled) {
    disabledReason = "External links are disabled by policy.";
  }

  return (
    <button
      type="button"
      className={`rounded-full px-4 py-2 font-semibold transition-colors [font-size:var(--app-text-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-button-ring,_var(--app-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-background)] ${
        isDisabled
          ? "cursor-not-allowed bg-[color:var(--app-button-disabled-bg,_var(--app-surface-alt))] text-[color:var(--app-button-disabled-text,_var(--app-muted))]"
          : "bg-[color:var(--app-button-bg,_var(--app-accent))] text-[color:var(--app-button-text,_var(--app-accent-text))] hover:bg-[color:var(--app-button-bg-hover,_var(--app-accent-hover))]"
      }`}
      title={isDisabled ? disabledReason ?? undefined : undefined}
      onClick={() => {
        if (!actionName || !onAction || isDisabled) {
          return;
        }
        const params: Record<string, string> = {};
        if (sectionId) {
          params.sectionId = sectionId;
        }
        if (resolvedConfigId) {
          params.configId = resolvedConfigId;
        }
        onAction({ name: actionName, params });
      }}
      disabled={isDisabled}
    >
      {isRunning && isRunAction ? "Running..." : resolvedLabel}
    </button>
  );
}

function Divider({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const className = typeof props.className === "string" ? props.className : "";
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
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const className = typeof props.className === "string" ? props.className : "";
  const themeMotion = runtime?.theme?.motion;
  const fallbackEasing = themeMotion?.easing ?? "cubic-bezier(0.16, 1, 0.3, 1)";
  const preset = resolveMotionPreset(props.preset);
  const durationMs = resolveNumber(
    props.durationMs,
    themeMotion?.durationMs ?? 220,
  );
  const delayMs = resolveNumber(props.delayMs, themeMotion?.delayMs ?? 0);
  const easing = resolveEasing(props.easing, fallbackEasing);

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
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const className = typeof props.className === "string" ? props.className : "";
  const themeMotion = runtime?.theme?.motion;
  const fallbackEasing = themeMotion?.easing ?? "cubic-bezier(0.16, 1, 0.3, 1)";
  const preset = resolveMotionPreset(props.preset);
  const durationMs = resolveNumber(
    props.durationMs,
    themeMotion?.durationMs ?? 220,
  );
  const delayMs = resolveNumber(props.delayMs, themeMotion?.delayMs ?? 0);
  const staggerMs = resolveNumber(
    props.staggerMs,
    themeMotion?.staggerMs ?? 70,
  );
  const easing = resolveEasing(props.easing, fallbackEasing);
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
  TextOutput: TextOutputBlock,
  ImageOutput: ImageOutputBlock,
  Divider,
};
