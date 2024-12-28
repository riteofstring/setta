import CodeMirror from "@uiw/react-codemirror";
import {
  codeAreaTabOnEnterKeyHandlers,
  useCodeAreaHeight,
} from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { getSectionVariant } from "state/actions/sectionInfos";
import { useSectionInfos, useYamlValue } from "state/definitions";

export function SectionYamlView({ sectionId }) {
  const isDisabled = useSectionInfos(
    (x) => getSectionVariant(sectionId, x).isFrozen,
  );
  return <YamlView sectionId={sectionId} isDisabled={isDisabled} />;
}

export function YamlView({ sectionId, isDisabled }) {
  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);

  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({
    sectionId,
    language: "yaml",
    indentWithTab: true,
    escapeToBlur: true,
    onEscape: onEscapeFocusOnArticleDiv,
    isDisabled,
  });

  const yamlValue = useYamlValue((x) => x[sectionId] ?? "");
  function setYamlValue(v) {
    useYamlValue.setState({ [sectionId]: v });
  }

  // We need this class to avoid double scrollbars in GlobalParamSweepArea.
  // But we don't apply it when we're resizing because doing so causes
  // the scrollTop logic in useCodeAreaHeight to break.
  // (It ends up always scrolling to the top after resizing.)
  const cmEditorClass = overflow === "" ? "[&_.cm-editor]:h-full" : "";

  return (
    <article
      ref={wrapperRef}
      className={`nodrag section-full-no-title min-h-0 cursor-auto [&_*]:!outline-0 [&_.cm-theme]:h-full ${cmEditorClass} ${overflow} ${nowheel}`}
      onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
      tabIndex="0"
    >
      <CodeMirror
        maxHeight={maxHeight}
        value={yamlValue}
        onChange={setYamlValue}
        theme={theme}
        extensions={extensions}
        onCreateEditor={handleCreateEditor}
        indentWithTab={false}
      />
    </article>
  );
}
