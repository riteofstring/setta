import CodeMirror from "@uiw/react-codemirror";
import {
  codeAreaTabOnEnterKeyHandlers,
  useCodeAreaHeight,
} from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getSectionImplLayering,
  setEffectiveImplValue,
} from "state/actions/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useProjectState } from "state/definitions";
import { useTextBlockTextAndEditability } from "state/hooks/sectionVariants";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import { SectionTypeEnum, TextBlockFormatEnum } from "utils/generatedTypes";

export function MarkdownEditorInPane({ sectionId }) {
  const wrapperRef = useRef(); // used by onTabOnEnterKeyHandlers

  return (
    <MarkdownEditorCore
      sectionId={sectionId}
      wrapperClassName="cursor-auto overflow-y-scroll [&_*]:!outline-0"
      ref={wrapperRef}
    />
  );
}

export function MarkdownEditorInSection({ sectionId }) {
  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  return (
    <MarkdownEditorCore
      sectionId={sectionId}
      onCreateEditor={handleCreateEditor}
      maxHeight={maxHeight}
      ref={wrapperRef}
      wrapperClassName={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag section-full-no-title cursor-auto [&_*]:!outline-0 ${overflow} ${nowheel}`}
    />
  );
}

const _MarkdownEditorCore = React.forwardRef(
  ({ sectionId, maxHeight, onCreateEditor, wrapperClassName }, ref) => {
    const { format, text, isFrozen } =
      useTextBlockTextAndEditability(sectionId);

    const [localText, setLocalText] = useState(text);

    useEffect(() => {
      if (text !== localText) {
        setLocalText(text);
      }
    }, [text]);

    const debouncedSetText = useCallback(
      _.debounce((sectionId, v, text) => {
        if (v !== text) {
          useProjectState.setState((state) => {
            const layering = getSectionImplLayering(state, sectionId);
            const baseImpl = state.sectionImpls[layering.impl];
            const core = state.sections[sectionId];
            if (!baseImpl || !core) {
              throw new Error();
            }
            if (
              baseImpl.type !== SectionTypeEnum.TextBlock ||
              core.type !== SectionTypeEnum.TextBlock ||
              layering.type !== SectionTypeEnum.TextBlock
            ) {
              throw new Error();
            }
            const impl = setEffectiveImplValue<"TextBlockSection">(
              baseImpl,
              core,
              layering,
              { text: v },
            );
            if (impl.headingAsSectionName) {
              const section = state.sections[sectionId];
              if (!section) {
                throw new Error();
              }
              section.name = getFirstHeadingOrText(v) ?? section.name;
            }
          });
          maybeIncrementProjectStateVersion(true);
        }
      }, 200),
      [],
    );

    function onChange(v) {
      setLocalText(v);
      debouncedSetText(sectionId, v, text);
    }

    const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
      codeAreaTabOnEnterKeyHandlers(ref);

    const theme = useCodeMirrorStyle();

    const extensions = getExtensions({
      language: format === TextBlockFormatEnum.Markdown ? "markdown" : null,
      tabToAutocomplete: true,
      indentWithTab: true,
      isDisabled: isFrozen,
      onEscape: onEscapeFocusOnArticleDiv,
    });

    return (
      <article
        ref={ref}
        className={wrapperClassName}
        onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
        tabIndex={0}
      >
        <CodeMirror
          maxHeight={maxHeight}
          value={text}
          theme={theme}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={onCreateEditor}
          indentWithTab={false} // I take care of this in getExtensions
          basicSetup={{ tabSize: 4 }}
        />
      </article>
    );
  },
);

const MarkdownEditorCore = React.memo(_MarkdownEditorCore);

function getFirstHeadingOrText(markdown) {
  // Trim leading whitespace
  const trimmedMarkdown = markdown.trimStart();

  // Look for the first heading anywhere in the text
  const headingMatch = trimmedMarkdown.match(/(^|\n)(#+)\s*(.*?)(?=\n|$)/);

  if (headingMatch) {
    // Return the heading text (group 3 captures the text after # and spaces)
    return headingMatch[3].trim();
  }

  return null;
}
