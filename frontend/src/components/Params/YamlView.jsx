import CodeMirror from "@uiw/react-codemirror";
import { useCodeAreaHeight } from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useYamlValue } from "state/definitions";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";

export function SectionYamlView({ sectionId }) {
  const isDisabled = useSectionVariantIsFrozen(sectionId);
  return <YamlView sectionId={sectionId} isDisabled={isDisabled} />;
}

export function YamlView({ sectionId, isDisabled }) {
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({
    sectionId,
    language: "yaml",
    indentWithTab: true,
    escapeToBlur: true,
    isDisabled,
  });
  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

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
