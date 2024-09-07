import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";

export function YamlView({ sectionId, yamlValue, setYamlValue }) {
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({ sectionId, language: "yaml" });

  return (
    <article
      className={`nodrag nowheel section-full-no-title cursor-auto [&_*]:!outline-0`}
    >
      <CodeMirror
        value={yamlValue}
        onChange={setYamlValue}
        theme={theme}
        extensions={extensions}
      />
    </article>
  );
}
