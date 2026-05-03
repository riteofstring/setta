import _ from "lodash";

import React from "react";

import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";

import { useProjectState } from "state/definitions";

import {
  SectionTypeEnum,
  TextBlockFormatEnum,
  type SectionType,
} from "utils/generatedTypes";

import { SectionTitle } from "../SectionTitle";

import {
  TitleStyleOptions,
  editingTitleBaseClassName,
  editingTitleDefaultClassName,
  fixedTitleBaseClassName,
  fixedTitleDefaultClassName,
  fixedTitleSectionTypes,
  notEditingTitleBaseClassName,
} from "./sectionHeader";

export function TextBlockCardTitle({
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

export function getTitleStyles({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}: TitleStyleOptions) {
  const titleStyleOptions = {
    isActiveSection,
    isInOtherProjectConfigs,
    sectionTypeName,
    hasSectionStyleTheme,
  };
  const notEditing = getNotEditingStyle(titleStyleOptions);

  if (isFixedTitleSection(sectionTypeName)) {
    return { fixed: notEditing };
  }

  return {
    editing: getEditingTitleClassName(hasSectionStyleTheme),
    notEditing,
    fixed: getFixedTitleClassName(hasSectionStyleTheme),
  };
}

export function getEditingTitleClassName(hasSectionStyleTheme: boolean) {
  return hasSectionStyleTheme
    ? editingTitleBaseClassName
    : editingTitleDefaultClassName;
}

export function getFixedTitleClassName(hasSectionStyleTheme: boolean) {
  return hasSectionStyleTheme
    ? fixedTitleBaseClassName
    : fixedTitleDefaultClassName;
}

export function isFixedTitleSection(sectionTypeName: SectionType) {
  return fixedTitleSectionTypes.has(sectionTypeName);
}

export function getNotEditingStyle({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}: TitleStyleOptions) {
  return [
    notEditingTitleBaseClassName,
    getNotEditingTextColorClass({
      isActiveSection,
      isInOtherProjectConfigs,
      sectionTypeName,
      hasSectionStyleTheme,
    }),
    getNotEditingFontClass(sectionTypeName),
  ]
    .filter(Boolean)
    .join(" ");
}

export function getNotEditingTextColorClass({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}: TitleStyleOptions) {
  if (hasSectionStyleTheme) {
    return "";
  }
  if (!isActiveSection) {
    return sectionTypeName === SectionTypeEnum.Terminal
      ? "text-setta-300"
      : "text-setta-700 dark:text-setta-300";
  }
  if (isInOtherProjectConfigs) {
    return "text-purple-800 dark:text-purple-200";
  }
  if (sectionTypeName === SectionTypeEnum.GlobalVariables) {
    return "text-green-800 dark:text-green-200";
  }
  return sectionTypeName === SectionTypeEnum.Terminal
    ? "text-blue-400"
    : "text-blue-600 dark:text-blue-400";
}

export function getNotEditingFontClass(sectionTypeName: SectionType) {
  return isFixedTitleSection(sectionTypeName)
    ? "uppercase font-bold"
    : "font-bold";
}
