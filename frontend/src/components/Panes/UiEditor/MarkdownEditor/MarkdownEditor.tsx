import CodeMirror from "@uiw/react-codemirror";
import {
  codeAreaTabOnEnterKeyHandlers,
  useCodeAreaHeight,
} from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import { setTextBlockText } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import React, { useCallback, useRef } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useTextBlockTextAndEditability } from "state/hooks/sectionVariants";
import { useShareCapabilities } from "state/hooks/share";
import { useLocalPendingValue } from "state/hooks/utils";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
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
function _MarkdownEditorCore({
  sectionId,
  maxHeight,
  onCreateEditor,
  wrapperClassName,
  ref,
}) {
  const { format, text, isFrozen } = useTextBlockTextAndEditability(sectionId);
  const sectionVariantId = useProjectState((state) =>
    getCurrSectionVariantId(state, sectionId),
  );
  const { canEditParams } = useShareCapabilities();
  const isReadOnly = isFrozen || !canEditParams;
  const [value, setPendingValue] = useLocalPendingValue(
    text,
    (pendingValue) => {
      useProjectState.setState((state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          text: pendingValue,
        });
      });
    },
    sectionVariantId,
  );
  const debouncedSetText = useCallback(
    _.debounce((sectionId, v) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"TextBlockSection">(
            state,
            sectionId,
            {
              text: v,
            },
          );
        },
        send: (frontendOpId) =>
          callOpenAPI(
            setTextBlockText({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId,
                text: v,
                frontendOpId,
              },
            } as Parameters<typeof setTextBlockText>[0]),
          ),
      });
    }, 50),
    [],
  );
  function onChange(v: string) {
    if (isReadOnly) {
      return;
    }
    setPendingValue(v);
    debouncedSetText(sectionId, v);
  }
  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(ref);
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({
    language: format === TextBlockFormatEnum.Markdown ? "markdown" : null,
    tabToAutocomplete: true,
    indentWithTab: true,
    isDisabled: isReadOnly,
    onEscape: onEscapeFocusOnArticleDiv,
  });
  return (
    <article
      ref={ref}
      className={wrapperClassName}
      data-section-main-editor
      onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
      tabIndex={0}
    >
      <CodeMirror
        maxHeight={maxHeight}
        value={value}
        theme={theme}
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={onCreateEditor}
        indentWithTab={false} // I take care of this in getExtensions
        basicSetup={{ tabSize: 4 }}
      />
    </article>
  );
}
const MarkdownEditorCore = React.memo(_MarkdownEditorCore);
