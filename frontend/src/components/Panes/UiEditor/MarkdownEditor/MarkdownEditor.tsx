import CodeMirror from "@uiw/react-codemirror";
import {
  codeAreaTabOnEnterKeyHandlers,
  useCodeAreaHeight,
} from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import React, { useCallback, useRef } from "react";
import {
  addPendingOp,
  getCurrProjectConfigId,
  setEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useTextBlockTextAndEditability } from "state/hooks/sectionVariants";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import { route_set_text_block_text } from "utils/generatedEndpoints";
import { TextBlockFormatEnum } from "utils/generatedTypes";

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

    const debouncedSetText = useCallback(
      _.debounce((sectionId, v) => {
        const frontendOpId = addPendingOp((state) =>
          setEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
            text: v,
          }),
        );
        route_set_text_block_text({
          frontendOpId,
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          text: v,
        });
      }, 200),
      [],
    );

    function onChange(v) {
      debouncedSetText(sectionId, v);
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
