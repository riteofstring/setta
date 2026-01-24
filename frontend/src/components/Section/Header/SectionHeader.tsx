import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import React from "react";
import { TbSortDescending2 } from "react-icons/tb";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useIsSeriesElement } from "state/hooks/uiTypes";
import {
  SectionTypeEnum,
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
import { ToggleTextBlockDisplayModeButton } from "./ToggleTextBlockDisplayModeButton";
import { ToggleEntryCodeBlockButton } from "./ToggleEntryCodeBlockButton";

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
          sectionTypeName === SectionTypeEnum.GenPythonCode) && (
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
      setHasMarkdownHeading(hasMarkdownH1(text));
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
          setHasMarkdownHeading(hasMarkdownH1(text));
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

function hasMarkdownH1(markdown: string) {
  const trimmed = markdown.trimStart();
  const match = trimmed.match(
    /(?:^|\n)\s{0,3}#(?!#)\s*(.*?)(?=\n|$)/,
  );
  if (!match) {
    return false;
  }
  return match[1].trim().length > 0;
}

function getTitleStyles({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
}) {
  const editing =
    "cursor-text nodrag px-1 py-0 leading-5 -ml-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-3/5 dark:text-white font-bold text-[.7rem] tracking-tight";

  const notEditing = getNotEditingStyle({
    isActiveSection,
    isInOtherProjectConfigs,
    sectionTypeName,
  });

  if (
    sectionTypeName === SectionTypeEnum.GlobalVariables ||
    sectionTypeName === SectionTypeEnum.GenPythonCode
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
    sectionTypeName === SectionTypeEnum.GenPythonCode
  ) {
    fontClass = "uppercase font-bold";
  }

  // Combine all the classes
  const baseClasses =
    "px-1 py-0 -ml-1 w-3/5 focus-visible:ring-0 focus-visible:outline-none box-border rounded-md border border-solid border-transparent focus-visible:border-blue-500 leading-5 font-bold tracking-tight cursor-pointer max-w-full text-[.7rem] truncate";

  return `${baseClasses} ${textColorClass} ${fontClass}`;
}
