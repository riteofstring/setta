import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import React, { useLayoutEffect, useRef } from "react";
import { RiFocus2Line } from "react-icons/ri";
import { TbBell, TbBellOff, TbSortDescending2 } from "react-icons/tb";
import {
  setCodeSectionDiagnosticCodeSuppression,
  setCodeSectionDiagnosticsMuted,
} from "state/actions/lspDiagnostics";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplOfType,
  isBaseCodeSectionType,
} from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import {
  useAIFollow,
  useLspDiagnostics,
  useProjectState,
  useShareSession,
  useTemporaryMiscState,
} from "state/definitions";
import { useIsSeriesElement } from "state/hooks/uiTypes";
import { projectConfigHasPythonCodegen } from "utils/codegenTargets";
import { getSectionHeaderHeightKey } from "utils/constants";
import {
  CodeLanguageEnum,
  SectionTypeEnum,
  SettaLspDiagnostic,
  TextBlockFormatEnum,
  type SectionType,
} from "utils/generatedTypes";
import {
  getSectionChromeTitleDomAdapter,
  resolveSectionChromeTitleDecorations,
} from "../Container/sectionChrome";
import { Incrementer } from "../SectionParts/Incrementer";
import { AttachedTerminalControls } from "./AttachedTerminalControls";
import { DeleteOrHideButton } from "./DeleteOrHideButton";
import { LockPositionButton } from "./LockPositionButton";
import MenuButton from "./MenuButton/MenuButton";
import { MinimizeButton } from "./MinimizeButton";
import { RunButton } from "./RunButton";
import { SectionTitle } from "./SectionTitle";
import { ToggleEntryCodeBlockButton } from "./ToggleEntryCodeBlockButton";
import { ToggleTextBlockDisplayModeButton } from "./ToggleTextBlockDisplayModeButton";

export type SectionHeaderLayoutRenderProps = {
  actions: React.ReactNode;
  leadingControls: React.ReactNode;
  title: React.ReactNode;
};

type SectionHeaderLayoutRenderer =
  React.ComponentType<SectionHeaderLayoutRenderProps>;

export type SectionHeaderControlsRenderProps = {
  codeDiagnosticsLabel: string;
  codeDiagnosticsMuted: boolean;
  codeSectionDiagnostics: Array<SettaLspDiagnostic>;
  extraControls: React.ReactNode;
  genCodeDiagnostics: Array<SettaLspDiagnostic>;
  hasSectionStyleTheme: boolean;
  inlineSuppressionHint: string | null;
  isDeploymentMode: boolean;
  isFollowSelected: boolean;
  isRoot: boolean;
  isSeriesElement: boolean;
  isUserView: boolean;
  onSetSuppressedCode: (
    code: NonNullable<SettaLspDiagnostic["code"]>,
    suppress: boolean,
  ) => void;
  onToggleCodeDiagnosticsMuted: () => void;
  onToggleFollowSelection: () => void;
  pythonCodegenEnabled: boolean;
  sectionId: string;
  sectionTypeName: SectionType;
  showCodeDiagnosticsPopover: boolean;
  showSectionContainerControls: boolean;
  suppressedCodes: Array<NonNullable<SettaLspDiagnostic["code"]>>;
};

type SectionHeaderControlsRenderer =
  React.ComponentType<SectionHeaderControlsRenderProps>;

type SectionHeaderProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  isRoot: boolean;
  hasSectionStyleTheme: boolean;
  extraControls?: React.ReactNode;
  showSectionContainerControls?: boolean;
  trackMeasuredHeight?: boolean;
  controlsRenderer?: SectionHeaderControlsRenderer;
  layoutRenderer?: SectionHeaderLayoutRenderer;
  headerProps?: Omit<
    React.ComponentPropsWithoutRef<"header">,
    "children" | "ref"
  >;
};

function _SectionHeader({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  isRoot,
  hasSectionStyleTheme,
  extraControls = null,
  showSectionContainerControls = true,
  trackMeasuredHeight = true,
  controlsRenderer,
  layoutRenderer,
  headerProps,
}: SectionHeaderProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const heightKey = getSectionHeaderHeightKey(sectionId);

  useLayoutEffect(() => {
    if (!trackMeasuredHeight) {
      return;
    }
    const node = headerRef.current;
    if (!node) {
      useTemporaryMiscState.setState({ [heightKey]: 0 });
      return;
    }
    let lastMeasuredHeight: number | null = null;
    const updateHeight = () => {
      const style = window.getComputedStyle(node);
      const marginHeight =
        (Number.parseFloat(style.marginTop) || 0) +
        (Number.parseFloat(style.marginBottom) || 0);
      const measuredHeight = node.offsetHeight + marginHeight;
      const nextHeight = Math.ceil(measuredHeight);
      if (lastMeasuredHeight === nextHeight) {
        return;
      }
      lastMeasuredHeight = nextHeight;
      useTemporaryMiscState.setState({
        [heightKey]: nextHeight > 0 ? nextHeight : 0,
      });
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
      useTemporaryMiscState.setState({ [heightKey]: 0 });
    };
  }, [heightKey, trackMeasuredHeight]);

  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const tagColor = useProjectState((x) => {
    if (!x.sections[sectionId]) {
      return null;
    }
    return getCurrEffectiveSectionImpl(x, sectionId).tagColor ?? null;
  });
  const isSeriesElement = useIsSeriesElement(sectionId) && !isRoot;
  const pythonCodegenEnabled = useProjectState((x) =>
    projectConfigHasPythonCodegen(x.projectConfig),
  );
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const selectedSectionIds = useAIFollow(
    (state) => state.selectedSectionIdsByProjectConfigId[projectConfigId] ?? [],
    _.isEqual,
  );
  const isFollowSelected = selectedSectionIds.includes(sectionId);
  const codeSectionDiagnostics = useLspDiagnostics((x) => {
    const diagnostics = x.codeSections[sectionId];
    return diagnostics ?? [];
  });
  const genCodeDiagnostics = useLspDiagnostics((x) => x.unmappedGenCode);
  const codeDiagnosticsInfo = useProjectState((x) => {
    if (sectionTypeName !== SectionTypeEnum.Code) {
      return null;
    }
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Code,
    );
    return {
      ignoreState: impl.diagnosticsIgnoreState,
      language: impl.codeLanguage,
    };
  });
  const codeDiagnosticsIgnoreState = codeDiagnosticsInfo?.ignoreState ?? null;
  const codeDiagnosticsMuted = codeDiagnosticsIgnoreState?.muted ?? false;
  const suppressedCodes = codeDiagnosticsIgnoreState?.suppressedCodes ?? [];
  const inlineSuppressionHint =
    codeDiagnosticsInfo?.language === CodeLanguageEnum.python
      ? "Inline suppressions: add a Python ignore comment on the line (for example, # type: ignore)."
      : null;
  let codeDiagnosticsLabel = "Diagnostics";
  if (codeDiagnosticsMuted) {
    codeDiagnosticsLabel = "Diagnostics muted";
  } else if (codeSectionDiagnostics.length > 0) {
    codeDiagnosticsLabel = `Issues ${codeSectionDiagnostics.length}`;
  } else if (suppressedCodes.length > 0) {
    codeDiagnosticsLabel = `Suppressed ${suppressedCodes.length}`;
  }
  const showCodeDiagnosticsPopover =
    !isDeploymentMode &&
    sectionTypeName === SectionTypeEnum.Code &&
    (codeSectionDiagnostics.length > 0 ||
      suppressedCodes.length > 0 ||
      codeDiagnosticsMuted);

  // DOM: maybe get rid of the extra div under header?

  const headerClassName = headerProps?.className ?? "";
  const ControlsRenderer =
    controlsRenderer ?? DefaultSectionHeaderControlsDomAdapter;
  const LayoutRenderer = layoutRenderer ?? DefaultSectionHeaderLayoutDomAdapter;
  const leadingControls = (
    <>
      <MenuButton
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
      {tagColor && (
        <span
          className="nodrag ml-2.5 mr-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
          style={{ backgroundColor: tagColor }}
          title={`Color tag: ${tagColor}`}
        />
      )}
    </>
  );
  const title = (
    <MaybeCardTitle
      sectionId={sectionId}
      isInOtherProjectConfigs={isInOtherProjectConfigs}
      sectionTypeName={sectionTypeName}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  );
  const actions = (
    <ControlsRenderer
      codeDiagnosticsLabel={codeDiagnosticsLabel}
      codeDiagnosticsMuted={codeDiagnosticsMuted}
      codeSectionDiagnostics={codeSectionDiagnostics}
      extraControls={extraControls}
      genCodeDiagnostics={genCodeDiagnostics}
      hasSectionStyleTheme={hasSectionStyleTheme}
      inlineSuppressionHint={inlineSuppressionHint}
      isDeploymentMode={isDeploymentMode}
      isFollowSelected={isFollowSelected}
      isRoot={isRoot}
      isSeriesElement={isSeriesElement}
      isUserView={isUserView}
      onSetSuppressedCode={(code, suppress) => {
        void setCodeSectionDiagnosticCodeSuppression(sectionId, code, suppress);
      }}
      onToggleCodeDiagnosticsMuted={() => {
        void setCodeSectionDiagnosticsMuted(sectionId, !codeDiagnosticsMuted);
      }}
      onToggleFollowSelection={() => {
        useAIFollow.setState((state) => {
          const selected =
            state.selectedSectionIdsByProjectConfigId[projectConfigId] ??
            (state.selectedSectionIdsByProjectConfigId[projectConfigId] = []);
          const existingIndex = selected.indexOf(sectionId);
          if (existingIndex === -1) {
            selected.push(sectionId);
          } else {
            selected.splice(existingIndex, 1);
          }
          if (state.mode !== "selected") {
            state.mode = "selected";
          }
        });
      }}
      pythonCodegenEnabled={pythonCodegenEnabled}
      sectionId={sectionId}
      sectionTypeName={sectionTypeName}
      showCodeDiagnosticsPopover={showCodeDiagnosticsPopover}
      showSectionContainerControls={showSectionContainerControls}
      suppressedCodes={suppressedCodes}
    />
  );

  return (
    <header
      {...headerProps}
      className={`section-title mx-2 flex flex-row items-center ${headerClassName}`}
      ref={headerRef}
      style={
        hasSectionStyleTheme
          ? {
              color: "var(--setta-section-style-text)",
              ...headerProps?.style,
            }
          : headerProps?.style
      }
    >
      <LayoutRenderer
        actions={actions}
        leadingControls={leadingControls}
        title={title}
      />
    </header>
  );
}

export const SectionHeader = React.memo(_SectionHeader);

export function DefaultSectionHeaderLayoutDomAdapter({
  actions,
  leadingControls,
  title,
}: SectionHeaderLayoutRenderProps) {
  return (
    <>
      {leadingControls}
      {title}
      <div className="z-10 ml-auto flex items-center">{actions}</div>
    </>
  );
}

export function DefaultSectionHeaderControlsDomAdapter({
  codeDiagnosticsLabel,
  codeDiagnosticsMuted,
  codeSectionDiagnostics,
  extraControls,
  genCodeDiagnostics,
  hasSectionStyleTheme,
  inlineSuppressionHint,
  isDeploymentMode,
  isFollowSelected,
  isRoot,
  isSeriesElement,
  isUserView,
  onSetSuppressedCode,
  onToggleCodeDiagnosticsMuted,
  onToggleFollowSelection,
  pythonCodegenEnabled,
  sectionId,
  sectionTypeName,
  showCodeDiagnosticsPopover,
  showSectionContainerControls,
  suppressedCodes,
}: SectionHeaderControlsRenderProps) {
  let followButtonClassName =
    "nodrag mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2";
  if (isFollowSelected) {
    followButtonClassName = `${followButtonClassName} bg-blue-100 text-blue-600 shadow-sm dark:bg-blue-950/60 dark:text-blue-300`;
  } else {
    followButtonClassName = `${followButtonClassName} text-setta-500 hover:bg-blue-100 hover:text-blue-600 dark:text-setta-500 dark:hover:bg-blue-950/60 dark:hover:text-blue-300`;
  }

  return (
    <>
      {!isDeploymentMode && sectionTypeName === SectionTypeEnum.Code && (
        <button
          className={`nodrag ml-2 inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-sm transition ${codeDiagnosticsMuted ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-600/40 dark:bg-slate-800/70 dark:text-slate-200"}`}
          onClick={onToggleCodeDiagnosticsMuted}
          title={
            codeDiagnosticsMuted ? "Unmute diagnostics" : "Mute diagnostics"
          }
          type="button"
        >
          {codeDiagnosticsMuted ? (
            <TbBellOff className="text-[12px]" />
          ) : (
            <TbBell className="text-[12px]" />
          )}
        </button>
      )}
      {!isDeploymentMode && showCodeDiagnosticsPopover && (
        <DiagnosticsPopover
          diagnostics={codeSectionDiagnostics}
          label={codeDiagnosticsLabel}
          title="Problems"
          suppressedCodes={suppressedCodes}
          isMuted={codeDiagnosticsMuted}
          onSetSuppressedCode={onSetSuppressedCode}
          inlineSuppressionHint={inlineSuppressionHint}
        />
      )}
      {!isDeploymentMode &&
        sectionTypeName === SectionTypeEnum.GenPythonCode &&
        genCodeDiagnostics.length > 0 && (
          <DiagnosticsPopover
            diagnostics={genCodeDiagnostics}
            label={`Issues ${genCodeDiagnostics.length}`}
            title="Generated code issues"
          />
        )}
      {isSeriesElement && (
        <StandardPopover
          arrowClasses="fill-white dark:fill-setta-800"
          contentClasses="z-20"
          trigger={
            <button className="nodrag flex inline-flex h-3 w-3 cursor-pointer items-center justify-center rounded-full bg-transparent px-1 py-1 text-setta-500 focus-visible:ring-2 [&_*]:hover:text-setta-500 [&_*]:dark:hover:text-setta-400">
              <TbSortDescending2 className="text-setta-300 dark:text-setta-700" />
            </button>
          }
        >
          <Incrementer sectionId={sectionId} isRoot={isRoot} popover={true} />
        </StandardPopover>
      )}
      {(sectionTypeName === SectionTypeEnum.Code ||
        (pythonCodegenEnabled &&
          sectionTypeName === SectionTypeEnum.GenPythonCode)) && (
        <>
          <RunButton sectionId={sectionId} />
          <ToggleEntryCodeBlockButton
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
          />
        </>
      )}
      {isBaseCodeSectionType(sectionTypeName) && (
        <AttachedTerminalControls
          sectionId={sectionId}
          isUserView={isUserView}
        />
      )}
      {!isUserView && sectionTypeName === SectionTypeEnum.TextBlock && (
        <ToggleTextBlockDisplayModeButton sectionId={sectionId} />
      )}
      {!isDeploymentMode && sectionTypeName === SectionTypeEnum.Chat && (
        <button
          aria-label={isFollowSelected ? "Stop following chat" : "Follow chat"}
          aria-pressed={isFollowSelected}
          className={followButtonClassName}
          onClick={onToggleFollowSelection}
          title={isFollowSelected ? "Stop following chat" : "Follow chat"}
          type="button"
          {...getFloatingBoxHandlers({
            content: isFollowSelected ? "Stop following chat" : "Follow chat",
          })}
        >
          <RiFocus2Line className="text-[12px]" />
        </button>
      )}
      {extraControls}
      {!isUserView && showSectionContainerControls && (
        <LockPositionButton
          sectionId={sectionId}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      )}
      {!isUserView && showSectionContainerControls && !isRoot && (
        <MinimizeButton
          sectionId={sectionId}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      )}
      {!isUserView && showSectionContainerControls && (
        <DeleteOrHideButton
          sectionId={sectionId}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      )}
    </>
  );
}

function DiagnosticsPopover({
  diagnostics,
  label,
  title,
  suppressedCodes,
  isMuted,
  onSetSuppressedCode,
  inlineSuppressionHint,
}: {
  diagnostics: Array<SettaLspDiagnostic>;
  label: string;
  title: string;
  suppressedCodes?: Array<NonNullable<SettaLspDiagnostic["code"]>>;
  isMuted?: boolean;
  onSetSuppressedCode?: (
    code: NonNullable<SettaLspDiagnostic["code"]>,
    suppress: boolean,
  ) => void;
  inlineSuppressionHint?: string | null;
}) {
  const badgeClassName = getBadgeClassName(diagnostics);
  const hasSuppressedCodes = (suppressedCodes ?? []).length > 0;
  const hasDiagnostics = diagnostics.length > 0;
  return (
    <StandardPopover
      arrowClasses="fill-white/95 stroke-[1px] stroke-slate-200/80 dark:fill-slate-950/90 dark:stroke-slate-700/70"
      contentClasses="z-30 w-[min(16rem,calc(100vw-0.75rem))] rounded-md border border-slate-200/80 bg-white/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.6)] ring-1 ring-white/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-950/90 dark:ring-slate-800/60"
      trigger={
        <button
          className={`nodrag ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide shadow-[0_10px_24px_-16px_rgba(15,23,42,0.45)] ring-1 ring-white/70 backdrop-blur-sm transition dark:ring-slate-800/60 ${badgeClassName}`}
          type="button"
        >
          {label}
        </button>
      }
    >
      <div className="flex flex-col gap-1.5 p-1.5 text-[9px] text-slate-700 dark:text-slate-100">
        <div className="flex items-center justify-between rounded-md border border-slate-200/70 bg-slate-50/90 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-400">
          <span>{title}</span>
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-200">
            {diagnostics.length}
          </span>
        </div>
        {isMuted && (
          <div className="rounded-md border border-amber-200/80 bg-amber-50/90 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-amber-700 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Muted
          </div>
        )}
        {hasDiagnostics ? (
          <div className="max-h-48 overflow-auto pr-1">
            <ul className="flex flex-col gap-1">
              {diagnostics.map((diagnostic, idx) => {
                const { line, character } = diagnostic.range.start;
                const {
                  label: severityLabel,
                  className: severityClassName,
                  accentClassName: severityAccentClassName,
                } = getSeverityMeta(diagnostic.severity);
                const code = diagnostic.code;
                const codeLabel =
                  code === null || code === undefined ? null : String(code);
                const suppressHandler = onSetSuppressedCode;
                const canSuppress =
                  code !== null &&
                  code !== undefined &&
                  suppressHandler !== undefined;
                return (
                  <li
                    className={`rounded-md border border-slate-200/70 bg-white/90 p-1.5 text-[9px] shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)] dark:border-slate-700/70 dark:bg-slate-900/70 ${severityAccentClassName}`}
                    key={`${diagnostic.message}-${idx}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide shadow-sm ${severityClassName}`}
                      >
                        {severityLabel}
                      </span>
                      <span className="text-[8px] font-medium text-slate-500 dark:text-slate-400">
                        Line {line + 1}, Col {character + 1}
                      </span>
                      {codeLabel && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          {codeLabel}
                        </span>
                      )}
                      {diagnostic.source && (
                        <span className="text-[8px] text-slate-400 dark:text-slate-500">
                          {diagnostic.source}
                        </span>
                      )}
                      {canSuppress && (
                        <button
                          className="ml-auto rounded-full border border-slate-200/80 bg-white/90 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-slate-600"
                          onClick={() =>
                            void suppressHandler?.(
                              code as NonNullable<SettaLspDiagnostic["code"]>,
                              true,
                            )
                          }
                          type="button"
                        >
                          Suppress code
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-[9px] leading-snug text-slate-700 dark:text-slate-100">
                      {diagnostic.message}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200/80 bg-slate-50/70 px-1.5 py-1 text-[9px] text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-400">
            No active diagnostics.
          </div>
        )}
        {hasSuppressedCodes && onSetSuppressedCode && (
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
            <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Suppressed codes
            </div>
            <div className="flex flex-wrap gap-2">
              {(suppressedCodes ?? []).map((code) => (
                <button
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-slate-600"
                  key={`suppressed-${String(code)}`}
                  onClick={() => void onSetSuppressedCode(code, false)}
                  type="button"
                >
                  <span>{String(code)}</span>
                  <span className="text-[12px] leading-none">x</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {inlineSuppressionHint && (
          <div className="border-t border-slate-200 pt-2 text-[9px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {inlineSuppressionHint}
          </div>
        )}
      </div>
    </StandardPopover>
  );
}

function getBadgeClassName(diagnostics: Array<SettaLspDiagnostic>) {
  let hasError = false;
  let hasWarning = false;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 1) {
      hasError = true;
      break;
    }
    if (diagnostic.severity === 2) {
      hasWarning = true;
    }
  }
  if (hasError) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200";
  }
  if (hasWarning) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200";
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600/40 dark:bg-slate-700/30 dark:text-slate-200";
}

function getSeverityMeta(severity: number | null | undefined) {
  if (severity === 1) {
    return {
      label: "Error",
      className: "bg-red-500 text-white",
      accentClassName: "border-l-4 border-red-400/80",
    };
  }
  if (severity === 2) {
    return {
      label: "Warning",
      className: "bg-amber-400 text-slate-900",
      accentClassName: "border-l-4 border-amber-300/80",
    };
  }
  if (severity === 3) {
    return {
      label: "Info",
      className: "bg-sky-500 text-white",
      accentClassName: "border-l-4 border-sky-400/80",
    };
  }
  return {
    label: "Hint",
    className: "bg-slate-300 text-slate-900",
    accentClassName: "border-l-4 border-slate-300/80",
  };
}

function MaybeCardTitle({
  sectionId,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}) {
  const isActiveSection = useIsSectionUIActive(sectionId);
  return sectionTypeName === SectionTypeEnum.TextBlock ? (
    <TextBlockCardTitle
      sectionId={sectionId}
      isActiveSection={isActiveSection}
      isInOtherProjectConfigs={isInOtherProjectConfigs}
      sectionTypeName={sectionTypeName}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  ) : (
    <SectionTitle
      sectionId={sectionId}
      titleProps={getSectionTitleProps({
        isActiveSection,
        isInOtherProjectConfigs,
        sectionTypeName,
        hasSectionStyleTheme,
      })}
    />
  );
}

function TextBlockCardTitle({
  sectionId,
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}) {
  const { headingAsSectionName, format } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return {
      headingAsSectionName: impl.headingAsSectionName,
      format: impl.format,
    };
  }, _.isEqual);
  const [hasMarkdownHeading, setHasMarkdownHeading] = React.useState(false);

  React.useEffect(() => {
    if (!headingAsSectionName || format !== TextBlockFormatEnum.Markdown) {
      setHasMarkdownHeading(false);
      return;
    }
    let isFirst = true;
    const debouncedCompute = _.debounce((text: string) => {
      setHasMarkdownHeading(hasMarkdownHeadingText(text));
    }, 150);
    const unsubscribe = useProjectState.subscribe(
      (state) => {
        const impl = getCurrEffectiveSectionImplOfType(
          state,
          sectionId,
          SectionTypeEnum.TextBlock,
        );
        return impl.text;
      },
      (text) => {
        if (isFirst) {
          isFirst = false;
          setHasMarkdownHeading(hasMarkdownHeadingText(text));
          return;
        }
        debouncedCompute(text);
      },
      { fireImmediately: true },
    );
    return () => {
      debouncedCompute.cancel();
      unsubscribe();
    };
  }, [format, headingAsSectionName, sectionId]);

  const useHeadingAsSectionName =
    headingAsSectionName &&
    (format !== TextBlockFormatEnum.Markdown || hasMarkdownHeading);

  return (
    !useHeadingAsSectionName && (
      <SectionTitle
        sectionId={sectionId}
        titleProps={getSectionTitleProps({
          isActiveSection,
          isInOtherProjectConfigs,
          sectionTypeName,
          hasSectionStyleTheme,
        })}
      />
    )
  );
}

export function hasMarkdownHeadingText(markdown: string) {
  const match = markdown.match(/(^ {0,3}#{1,6}(?!#)\s*(\S.*)$)/m);
  if (!match) {
    return false;
  }
  const headingText = match[2];
  return headingText !== undefined && headingText.trim().length > 0;
}

function getSectionTitleProps({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}: {
  isActiveSection: boolean;
  isInOtherProjectConfigs: boolean;
  sectionTypeName: SectionType;
  hasSectionStyleTheme: boolean;
}) {
  return getSectionChromeTitleDomAdapter(
    resolveSectionChromeTitleDecorations({
      isActiveSection,
      isInOtherProjectConfigs,
      sectionTypeName,
      hasSectionStyleTheme,
    }),
  );
}
