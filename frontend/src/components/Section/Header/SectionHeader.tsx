import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import React from "react";
import { TbSortDescending2 } from "react-icons/tb";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useIsSeriesElement } from "state/hooks/uiTypes";
import { projectConfigHasPythonCodegen } from "utils/codegenTargets";
import {
  SectionTypeEnum,
  SettaLspDiagnostic,
  TextBlockFormatEnum,
  type SectionType,
} from "utils/generatedTypes";
import { Incrementer } from "../SectionParts/Incrementer";
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
};

function _SectionHeader({
  sectionId,
  isActiveSection,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  isRoot,
}: SectionHeaderProps) {
  const isSeriesElement = useIsSeriesElement(sectionId) && !isRoot;
  const pythonCodegenEnabled = useProjectState((x) =>
    projectConfigHasPythonCodegen(x.projectConfig),
  );
  const isShareMode = useShareSession((x) => x.isShareMode);
  const codeSectionDiagnostics = useLspDiagnostics((x) => {
    const diagnostics = x.codeSections[sectionId];
    return diagnostics ?? [];
  });
  const genCodeDiagnostics = useLspDiagnostics((x) => x.unmappedGenCode);

  // DOM: maybe get rid of the extra div under header?

  return (
    <header className="section-title mx-2 flex flex-row items-center">
      <MenuButton
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
      />
      <MaybeCardTitle
        sectionId={sectionId}
        isActiveSection={isActiveSection}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        sectionTypeName={sectionTypeName}
      />
      <div className="z-10 ml-auto flex items-center">
        {!isShareMode &&
          sectionTypeName === SectionTypeEnum.Code &&
          codeSectionDiagnostics.length > 0 && (
            <DiagnosticsPopover
              diagnostics={codeSectionDiagnostics}
              label={`${codeSectionDiagnostics.length}`}
              title="Problems"
            />
          )}
        {!isShareMode &&
          sectionTypeName === SectionTypeEnum.GenPythonCode &&
          genCodeDiagnostics.length > 0 && (
            <DiagnosticsPopover
              diagnostics={genCodeDiagnostics}
              label={`Gen issues ${genCodeDiagnostics.length}`}
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
        {!isUserView && sectionTypeName === SectionTypeEnum.TextBlock && (
          <ToggleTextBlockDisplayModeButton sectionId={sectionId} />
        )}
        {!isUserView && <LockPositionButton sectionId={sectionId} />}
        {!isUserView && !isRoot && <MinimizeButton sectionId={sectionId} />}
        {!isUserView && <DeleteOrHideButton sectionId={sectionId} />}
      </div>
    </header>
  );
}

export const SectionHeader = React.memo(_SectionHeader);

function DiagnosticsPopover({
  diagnostics,
  label,
  title,
}: {
  diagnostics: Array<SettaLspDiagnostic>;
  label: string;
  title: string;
}) {
  const badgeClassName = getBadgeClassName(diagnostics);
  return (
    <StandardPopover
      arrowClasses="fill-white dark:fill-setta-800"
      contentClasses="z-20"
      trigger={
        <button
          className={`nodrag ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClassName}`}
          type="button"
        >
          {label}
        </button>
      }
    >
      <div className="flex w-80 flex-col gap-2 p-2 text-xs text-slate-700 dark:text-slate-100">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <span>{title}</span>
          <span>{diagnostics.length}</span>
        </div>
        <div className="max-h-64 overflow-auto">
          <ul className="flex flex-col gap-2">
            {diagnostics.map((diagnostic, idx) => {
              const { line, character } = diagnostic.range.start;
              const { label: severityLabel, className: severityClassName } =
                getSeverityMeta(diagnostic.severity);
              return (
                <li
                  className="rounded-md border border-slate-200 bg-white/80 p-2 text-[11px] shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
                  key={`${diagnostic.message}-${idx}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${severityClassName}`}
                    >
                      {severityLabel}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Line {line + 1}, Col {character + 1}
                    </span>
                    {diagnostic.source && (
                      <span className="text-[10px] text-slate-400">
                        {diagnostic.source}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-700 dark:text-slate-100">
                    {diagnostic.message}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
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
    return "bg-red-500 text-white";
  }
  if (hasWarning) {
    return "bg-amber-400 text-slate-900";
  }
  return "bg-sky-500 text-white";
}

function getSeverityMeta(severity: number | null | undefined) {
  if (severity === 1) {
    return { label: "Error", className: "bg-red-500 text-white" };
  }
  if (severity === 2) {
    return { label: "Warning", className: "bg-amber-400 text-slate-900" };
  }
  if (severity === 3) {
    return { label: "Info", className: "bg-sky-500 text-white" };
  }
  return { label: "Hint", className: "bg-slate-300 text-slate-900" };
}

function MaybeCardTitle({
  sectionId,
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
}) {
  return sectionTypeName === SectionTypeEnum.TextBlock ? (
    <TextBlockCardTitle
      sectionId={sectionId}
      isActiveSection={isActiveSection}
      isInOtherProjectConfigs={isInOtherProjectConfigs}
      sectionTypeName={sectionTypeName}
    />
  ) : (
    <SectionTitle
      sectionId={sectionId}
      titleProps={getTitleStyles({
        isActiveSection,
        isInOtherProjectConfigs,
        sectionTypeName,
      })}
    />
  );
}

function TextBlockCardTitle({
  sectionId,
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
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
        titleProps={getTitleStyles({
          isActiveSection,
          isInOtherProjectConfigs,
          sectionTypeName,
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
}) {
  const editing =
    "cursor-text nodrag px-1 py-0 leading-5 -ml-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-full dark:text-white font-bold text-[.7rem] tracking-tight";

  const notEditing = getNotEditingStyle({
    isActiveSection,
    isInOtherProjectConfigs,
    sectionTypeName,
  });

  if (
    sectionTypeName === SectionTypeEnum.GlobalVariables ||
    sectionTypeName === SectionTypeEnum.GenPythonCode ||
    sectionTypeName === SectionTypeEnum.GenPythonMetadata
  ) {
    return { fixed: notEditing };
  }

  const fixed =
    "select-none italic focus-visible:ring-0 focus-visible:outline-none box-border border border-solid border-transparent focus-visible:border-blue-500 tracking-tighter text-xs text-setta-400 max-w-full truncate pr-0.5";

  return { editing, notEditing, fixed };
}

function getNotEditingStyle({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
}) {
  let textColorClass = "";
  let fontClass = "font-bold";

  // Handle text color based on conditions
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
