import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { DropdownInput } from "components/Params/ParamUIs/DropdownInput";
import { DropzoneInput } from "components/Params/ParamUIs/DropzoneInput";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { RotaryInput } from "components/Params/ParamUIs/RotaryInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
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
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImpl,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionParamLiteral,
} from "state/actions/websocketReceive";
import {
  useAppConfigs,
  useDecodedImages,
  useImages,
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
import { res200 } from "utils/endpointUtils";
import {
  route_get_password_param_value,
  route_load_cached_image_artifacts,
  route_set_param_entered_value,
} from "utils/generatedEndpoints";
import {
  BaseChildlessCodeObjImplUnion,
  BaseSectionImplUnion,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  DropzoneModeEnum,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  LiteralDependencyValue,
  SectionTypeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { shouldShowPasswordReveal } from "utils/paramValue";
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

type RawElementProps = {
  key?: unknown;
  type?: unknown;
  props?: Record<string, unknown>;
  children?: unknown;
};

type AppComponentProps = {
  element: RawElementProps & { props?: Record<string, unknown> };
  children?: React.ReactNode;
  onAction?: (name: string, params?: Record<string, unknown>) => void;
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

function resolveConfigId(
  bindingConfigId: string | null,
  runtimeConfigId: string | null,
  scopeConfigId: string | null,
) {
  return bindingConfigId ?? scopeConfigId ?? runtimeConfigId ?? null;
}

function Stack({ element, children }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const direction = props.direction === "row" ? "flex-row" : "flex-col";
  const themeGap = runtime?.theme?.spacing?.stackGap;
  const gap =
    typeof props.gap === "number" || typeof props.gap === "string"
      ? props.gap
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
  const className = typeof props.className === "string" ? props.className : "";
  const padding = typeof props.padding === "number" ? props.padding : null;
  const radius = typeof props.radius === "number" ? props.radius : null;
  const background =
    typeof props.background === "string" ? props.background : "none";
  const border = typeof props.border === "string" ? props.border : "none";

  const style: React.CSSProperties = {};
  if (padding !== null) {
    style.padding = `${padding}px`;
  }
  if (radius !== null) {
    style.borderRadius = `${radius}px`;
  }

  const backgroundByRole: Record<string, string> = {
    background: "var(--app-background)",
    surface: "var(--app-surface)",
    surfaceAlt: "var(--app-surface-alt)",
    card: "var(--app-card-bg)",
  };
  const resolvedBackground = backgroundByRole[background];
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
  const className = typeof props.className === "string" ? props.className : "";
  const themeGap = runtime?.theme?.spacing?.stackGap;
  const gap =
    typeof props.gap === "number" || typeof props.gap === "string"
      ? props.gap
      : typeof themeGap === "number" || typeof themeGap === "string"
        ? themeGap
        : 16;

  const rawColumns = typeof props.columns === "number" ? props.columns : 2;
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

  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border border-[color:var(--app-card-border)] bg-[color:var(--app-card-bg)] p-4 text-[color:var(--app-text)] shadow-sm ${className}`.trim()}
      style={cardStyle}
    >
      {(title || description) && (
        <header className="flex flex-col gap-1">
          {title && (
            <h3 className="text-sm font-semibold text-[color:var(--app-text)]">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-[color:var(--app-muted)]">
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

function Tabs({ element, children }: AppComponentProps) {
  const props = element.props ?? {};
  const defaultKey =
    typeof props.defaultKey === "string" ? props.defaultKey : null;
  const className = typeof props.className === "string" ? props.className : "";
  const tabs = React.Children.toArray(children).filter(React.isValidElement);
  const resolvedTabs = tabs.map((child, index) => {
    const tabElement = child.props?.element ?? null;
    const tabKey =
      (tabElement && typeof tabElement.key === "string" && tabElement.key) ||
      (typeof child.key === "string" ? child.key : `tab-${index}`);
    const title =
      tabElement?.props && typeof tabElement.props.title === "string"
        ? tabElement.props.title
        : `Tab ${index + 1}`;
    return { key: tabKey, title, child };
  });
  const [activeKey, setActiveKey] = React.useState(() => {
    if (defaultKey && resolvedTabs.some((tab) => tab.key === defaultKey)) {
      return defaultKey;
    }
    return resolvedTabs[0]?.key ?? null;
  });

  React.useEffect(() => {
    if (!activeKey && resolvedTabs.length > 0) {
      setActiveKey(resolvedTabs[0]?.key ?? null);
    }
  }, [activeKey, resolvedTabs]);

  return (
    <div className={`flex flex-col gap-4 ${className}`.trim()}>
      <div className="flex flex-wrap gap-2 border-b border-[color:var(--app-border)] pb-2">
        {resolvedTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveKey(tab.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
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
  const HeadingTag =
    `h${Math.min(Math.max(level, 1), 4)}` as keyof JSX.IntrinsicElements;
  const sizeClassByLevel: Record<number, string> = {
    1: "text-2xl",
    2: "text-xl",
    3: "text-lg",
    4: "text-base",
  };
  const sizeClass =
    sizeClassByLevel[Math.min(Math.max(level, 1), 4)] ?? "text-base";

  return (
    <HeadingTag
      className={`font-semibold tracking-tight text-[color:var(--app-text)] ${sizeClass} ${className}`.trim()}
      style={headingFont ? { fontFamily: headingFont } : undefined}
    >
      {text}
    </HeadingTag>
  );
}

function Text({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const text = typeof props.text === "string" ? props.text : "";
  const className = typeof props.className === "string" ? props.className : "";
  return (
    <p
      className={`text-sm text-[color:var(--app-muted)] ${className}`.trim()}
    >
      {text}
    </p>
  );
}

function ParamInputBlock({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const scope = useAppConfigScope();
  const {
    configId: bindingConfigId,
    sectionId,
    paramId,
    label,
    description,
  } = resolveParamBinding(props, runtime?.dataBindings);
  const resolvedConfigId = resolveConfigId(
    bindingConfigId,
    runtime?.defaultConfigId ?? null,
    scope.configId,
  );
  const configState = useAppConfigs((state) =>
    resolvedConfigId ? state.configs[resolvedConfigId] : null,
  );
  const serverMode = useServerMode((x) => x.mode);
  const modeResolved = useServerMode((x) => x.modeResolved);
  const canEditParams = runtime?.canEditParams ?? true;

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

  if (!resolvedConfigId) {
    return (
      <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-xs text-[color:var(--app-muted)]">
        Missing config scope.
      </div>
    );
  }

  if (!configState) {
    return (
      <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-xs text-[color:var(--app-muted)]">
        Loading config…
      </div>
    );
  }

  if (!sectionId || !paramId) {
    return (
      <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-xs text-[color:var(--app-muted)]">
        Missing param binding.
      </div>
    );
  }

  const { canRenderParam, displayName, sectionImpl, codeObjImpl } = (() => {
    const variantId =
      configState.previewSectionVariantMap[sectionId] ??
      configState.projectConfig.sectionVariantMap[sectionId];
    if (variantId === undefined) {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }
    const variant = configState.sectionVariants[variantId];
    if (!variant) {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }
    const sectionImpl = configState.sectionImpls[variant.impl];
    if (!sectionImpl || !configState.sections[sectionId]) {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }

    let codeObjVariantId: string | null = null;
    if (sectionImpl.type === SectionTypeEnum.MetaControl) {
      const controlParamId = sectionImpl.metaControlParamId;
      if (!controlParamId || controlParamId !== paramId) {
        return {
          canRenderParam: false,
          displayName: null,
          sectionImpl: null,
          codeObjImpl: null,
        };
      }
      codeObjVariantId = sectionImpl.codeObjVariantMap[paramId] ?? null;
    } else if (isBaseSectionWithParamsImpl(sectionImpl)) {
      codeObjVariantId = sectionImpl.codeObjVariantMap[paramId] ?? null;
    } else {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }

    if (!codeObjVariantId) {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }
    const codeObjVariant = configState.codeObjVariants[codeObjVariantId];
    if (!codeObjVariant) {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }
    if (!configState.codeObjImpls[codeObjVariant.impl]) {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }
    if (!configState.codeObjs[paramId]) {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }
    const previewActive =
      configState.previewSectionVariantMap[sectionId] !== undefined;
    const effectiveSectionImpl = getCurrEffectiveSectionImpl(
      configState,
      sectionId,
      previewActive,
    );
    const effectiveCodeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
      configState,
      sectionId,
      paramId,
      isBaseChildlessCodeObjImpl,
      previewActive,
    );
    return {
      canRenderParam: true,
      displayName: getParamDisplayName(configState, sectionId, paramId),
      sectionImpl: effectiveSectionImpl,
      codeObjImpl: effectiveCodeObjImpl,
    };
  })();

  if (!canRenderParam || !sectionImpl || !codeObjImpl) {
    return (
      <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-xs text-[color:var(--app-muted)]">
        Missing param binding.
      </div>
    );
  }

  const codeParamBlocked =
    modeResolved &&
    serverMode === "app" &&
    codeObjImpl.type === CodeObjTypeEnum.CodeParam;
  const effectiveCanEditParams = canEditParams && !codeParamBlocked;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--app-muted)]">
          {label ?? displayName ?? paramId}
        </span>
        {description && (
          <span className="text-[11px] text-[color:var(--app-muted)]">
            {description}
          </span>
        )}
      </div>
      <div className="rounded-md border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-2 py-1">
        <div
          className={effectiveCanEditParams ? "" : "pointer-events-none opacity-60"}
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
        {!canEditParams && (
          <div className="mt-2 text-[11px] text-[color:var(--app-muted)]">
            Param edits are disabled by policy.
          </div>
        )}
        {codeParamBlocked && canEditParams && (
          <div className="mt-2 text-[11px] text-[color:var(--app-muted)]">
            Code params cannot be edited in app deployments. Bind a MetaControl
            param instead.
          </div>
        )}
      </div>
    </div>
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
  const [value, setPendingValue] = useLocalPendingValue(baseValue);
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
        paramInfoId,
        nextValueStr,
      );
      return;
    }
    debouncedSetParamEnteredValue(
      configId,
      sectionId,
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

function AppParamUI({
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

  switch (codeObjType) {
    case CodeObjTypeEnum.CodeParam:
    case CodeObjTypeEnum.TextParam:
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
            realCodeClassName={`${NO_PAN_CLASS_NAME} nodrag self-end peer/textinput [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`}
            language={configLanguage}
            isDisabled={isDisabled}
            tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
            autocomplete={false}
          />
          <span
            className={`section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]`}
          />
        </>
      );
    }
    case CodeObjTypeEnum.SliderParam: {
      const min = "min" in codeObjImpl ? codeObjImpl.min ?? 0 : 0;
      const max = "max" in codeObjImpl ? codeObjImpl.max ?? 100 : 100;
      const step = "step" in codeObjImpl ? codeObjImpl.step ?? 1 : 1;
      return (
        <SliderInput
          value={Number.isFinite(_.toNumber(value)) ? _.toNumber(value) : min}
          onChange={(next) => onChange(next)}
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
          textInputClassName="hidden my-auto mr-[1px] h-5/6 w-8 cursor-auto resize-none rounded-lg border border-solid border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-2 text-center font-mono text-xs text-[color:var(--app-text)] focus-visible:border-[color:var(--app-accent)] @[132px]/slider:block"
        />
      );
    }
    case CodeObjTypeEnum.RotaryParam: {
      const min = "min" in codeObjImpl ? codeObjImpl.min ?? 0 : 0;
      const max = "max" in codeObjImpl ? codeObjImpl.max ?? 100 : 100;
      const step = "step" in codeObjImpl ? codeObjImpl.step ?? 1 : 1;
      return (
        <RotaryInput
          value={Number.isFinite(_.toNumber(value)) ? _.toNumber(value) : min}
          onChange={onChange}
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
          onChange={(next) => onChange(next)}
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
          colorPickerChoicesClasses="flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-full min-h-0 w-full min-w-0 items-center text-white"
          isDisabled={isDisabled}
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
          comboboxInputThemeClassName="!bg-[color:var(--app-surface)] hover:!bg-[color:var(--app-surface-alt)] !border-[color:var(--app-border)] !text-[color:var(--app-text)] !placeholder:text-[color:var(--app-muted)] focus:!border-[color:var(--app-accent)] focus-visible:!ring-[color:var(--app-accent)]"
          comboboxListThemeClassName="!border-[color:var(--app-border)] !bg-[color:var(--app-surface)] !text-[color:var(--app-text)]"
          isDisabled={isDisabled}
        />
      );
    }
    case CodeObjTypeEnum.PasswordParam: {
      const revealDisabled =
        isDisabled || isPasswordRevealPending || !onRevealPassword;
      const inputClassName = `${!isDisabled ? "cursor-text select-text" : ""} nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono text-xs text-[color:var(--app-text)]`;
      const revealClassName = `${revealDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} nodrag flex-none bg-transparent text-left font-mono text-xs text-[color:var(--app-muted)] hover:text-[color:var(--app-text)]`;
      const wrapperClassName = "section-value flex min-w-0 items-center gap-2";
      return (
        <>
          <div className={wrapperClassName}>
            <PasswordInput
              className={inputClassName}
              value={stringValue}
              onChange={onChange}
              onEscape={onEscape}
              isDisabled={isDisabled}
              placeholder={passwordPlaceholder}
              toggleClassName="flex-none"
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
          <span
            className={`section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]`}
          />
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
        />
      );
    }
    default:
      return null;
  }
}

const notifyParamUpdateError = _.throttle(
  (message: string) => {
    addTemporaryNotification(message);
  },
  2500,
  { trailing: false },
);

const debouncedSetParamEnteredValue = _.debounce(
  (configId: string, sectionId: string, paramInfoId: string, value: string) => {
    route_set_param_entered_value({
      projectConfigId: configId,
      sectionId,
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
  (configId: string, sectionId: string, paramInfoId: string, value: string) => {
    route_set_param_entered_value({
      projectConfigId: configId,
      sectionId,
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
  const allowDownloads = runtime?.allowFileDownloads ?? true;
  const allowLinks = runtime?.allowExternalLinks ?? true;
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
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-background)] ${
        isDisabled
          ? "cursor-not-allowed bg-[color:var(--app-surface-alt)] text-[color:var(--app-muted)]"
          : "bg-[color:var(--app-accent)] text-[color:var(--app-accent-text)] hover:bg-[color:var(--app-accent-hover)]"
      }`}
      title={isDisabled ? disabledReason ?? undefined : undefined}
      onClick={() => {
        if (!actionName || !onAction || isDisabled) {
          return;
        }
        const params = {
          ...(sectionId ? { sectionId } : {}),
          ...(resolvedConfigId ? { configId: resolvedConfigId } : {}),
        };
        onAction(actionName, params);
      }}
      disabled={isDisabled}
    >
      {isRunning && isRunAction ? "Running..." : resolvedLabel}
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
    return { text: effectiveImpl.text, format: effectiveImpl.format };
  }, [configState, resolvedConfigId, sectionId]);

  if (!resolvedConfigId || !sectionId || !textData) {
    return (
      <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-xs text-[color:var(--app-muted)]">
        Missing text output.
      </div>
    );
  }

  const { text, format } = textData;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-3">
      {label && (
        <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--app-muted)]">
          {label}
        </div>
      )}
      {format === TextBlockFormatEnum.Markdown ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          className="prose prose-sm max-w-none text-[color:var(--app-text)] dark:prose-invert"
          components={{ code: CodeBlock }}
        >
          {text}
        </ReactMarkdown>
      ) : (
        <pre className="whitespace-pre-wrap text-xs text-[color:var(--app-text)]">
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
  const res = await route_load_cached_image_artifacts({ paths });
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
      <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-xs text-[color:var(--app-muted)]">
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
        <div className="text-xs text-[color:var(--app-muted)]">
          Waiting for image output…
        </div>
      )}
    </figure>
  );
}

function Divider({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const className = typeof props.className === "string" ? props.className : "";
  return (
    <hr
      className={`border-[color:var(--app-border)] ${className}`.trim()}
    />
  );
}

export const appRegistry: Record<
  string,
  React.ComponentType<AppComponentProps>
> = {
  Stack,
  Box,
  Grid,
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
