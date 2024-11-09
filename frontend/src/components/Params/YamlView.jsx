import CodeMirror from "@uiw/react-codemirror";
import { useCodeAreaHeight } from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";

export function YamlView({ sectionId, yamlValue, setYamlValue }) {
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({
    sectionId,
    language: "yaml",
    indentWithTab: true,
  });
  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  return (
    <article
      ref={wrapperRef}
      className={`nodrag section-full-no-title cursor-auto [&_*]:!outline-0 ${overflow} ${nowheel}`}
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
