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

type SectionHeaderProps = {
  sectionId: string;
  isActiveSection: boolean;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  isRoot: boolean;
  hasSectionStyleTheme: boolean;
};

function _SectionHeader({
  sectionId,
  isActiveSection,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  isRoot,
  hasSectionStyleTheme,
}: SectionHeaderProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const heightKey = getSectionHeaderHeightKey(sectionId);

  useLayoutEffect(() => {
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
  }, [heightKey]);

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
  let followButtonClassName =
    "nodrag mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2";
  if (isFollowSelected) {
    followButtonClassName = `${followButtonClassName} bg-blue-100 text-blue-600 shadow-sm dark:bg-blue-950/60 dark:text-blue-300`;
  } else {
    followButtonClassName = `${followButtonClassName} text-setta-500 hover:bg-blue-100 hover:text-blue-600 dark:text-setta-500 dark:hover:bg-blue-950/60 dark:hover:text-blue-300`;
  }
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

  return (
    <header
      className="section-title mx-2 flex flex-row items-center"
      ref={headerRef}
      style={
        hasSectionStyleTheme
          ? { color: "var(--setta-section-style-text)" }
          : undefined
      }
    >
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
      <MaybeCardTitle
        sectionId={sectionId}
        isActiveSection={isActiveSection}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        sectionTypeName={sectionTypeName}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
      <div className="z-10 ml-auto flex items-center">
        {!isDeploymentMode && sectionTypeName === SectionTypeEnum.Code && (
          <button
            className={`nodrag ml-2 inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-sm transition ${codeDiagnosticsMuted ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-600/40 dark:bg-slate-800/70 dark:text-slate-200"}`}
            onClick={() =>
              void setCodeSectionDiagnosticsMuted(
                sectionId,
                !codeDiagnosticsMuted,
              )
            }
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
            onSetSuppressedCode={(code, suppress) => {
              void setCodeSectionDiagnosticCodeSuppression(
                sectionId,
                code,
                suppress,
              );
            }}
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
            aria-label="Follow chat"
            aria-pressed={isFollowSelected}
            className={followButtonClassName}
            onClick={() => {
              useAIFollow.setState((state) => {
                const selected =
                  state.selectedSectionIdsByProjectConfigId[projectConfigId] ??
                  (state.selectedSectionIdsByProjectConfigId[projectConfigId] =
                    []);
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
            title={isFollowSelected ? "Stop following chat" : "Follow chat"}
            type="button"
          >
            <RiFocus2Line className="text-[12px]" />
          </button>
        )}
        {!isUserView && (
          <LockPositionButton
            sectionId={sectionId}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        )}
        {!isUserView && !isRoot && (
          <MinimizeButton
            sectionId={sectionId}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        )}
        {!isUserView && (
          <DeleteOrHideButton
            sectionId={sectionId}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        )}
      </div>
    </header>
  );
}

export const SectionHeader = React.memo(_SectionHeader);

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
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}) {
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
      wrapperless={true}
      titleProps={getTitleStyles({
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
        wrapperless={true}
        titleProps={getTitleStyles({
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
  return match[2].trim().length > 0;
}

function getTitleStyles({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}) {
  const editing = hasSectionStyleTheme
    ? "cursor-text nodrag px-1 py-0 leading-5 -ml-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-full font-bold text-[.7rem] tracking-tight"
    : "cursor-text nodrag px-1 py-0 leading-5 -ml-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-full dark:text-white font-bold text-[.7rem] tracking-tight";

  const notEditing = getNotEditingStyle({
    isActiveSection,
    isInOtherProjectConfigs,
    sectionTypeName,
    hasSectionStyleTheme,
  });

  if (
    sectionTypeName === SectionTypeEnum.GlobalVariables ||
    sectionTypeName === SectionTypeEnum.GenPythonCode ||
    sectionTypeName === SectionTypeEnum.GenPythonMetadata
  ) {
    return { fixed: notEditing };
  }

  const fixed = hasSectionStyleTheme
    ? "select-none italic focus-visible:ring-0 focus-visible:outline-none box-border border border-solid border-transparent focus-visible:border-blue-500 tracking-tighter text-xs max-w-full truncate pr-0.5"
    : "select-none italic focus-visible:ring-0 focus-visible:outline-none box-border border border-solid border-transparent focus-visible:border-blue-500 tracking-tighter text-xs text-setta-400 max-w-full truncate pr-0.5";

  return { editing, notEditing, fixed };
}

function getNotEditingStyle({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}) {
  let textColorClass = "";
  let fontClass = "font-bold";

  // Handle text color based on conditions
  if (!hasSectionStyleTheme) {
    if (isActiveSection) {
      if (isInOtherProjectConfigs) {
        textColorClass = "text-purple-800 dark:text-purple-200";
      } else if (sectionTypeName === SectionTypeEnum.GlobalVariables) {
        textColorClass = "text-green-800 dark:text-green-200";
      } else if (sectionTypeName === SectionTypeEnum.Terminal) {
        textColorClass = "text-blue-400";
      } else {
        textColorClass = "text-blue-600 dark:text-blue-400";
      }
    } else {
      if (sectionTypeName === SectionTypeEnum.Terminal) {
        textColorClass = "text-setta-300";
      } else {
        textColorClass = "text-setta-700 dark:text-setta-300";
      }
    }
  }

  // Handle text case for global variables
  if (
    sectionTypeName === SectionTypeEnum.GlobalVariables ||
    sectionTypeName === SectionTypeEnum.GenPythonCode ||
    sectionTypeName === SectionTypeEnum.GenPythonMetadata
  ) {
    fontClass = "uppercase font-bold";
  }

  // Combine all the classes
  const baseClasses =
    "px-1 py-0 -ml-1 w-full focus-visible:ring-0 focus-visible:outline-none box-border rounded-md border border-solid border-transparent focus-visible:border-blue-500 leading-5 font-bold tracking-tight cursor-pointer max-w-full text-[.7rem] truncate";

  return `${baseClasses} ${textColorClass} ${fontClass}`;
}
