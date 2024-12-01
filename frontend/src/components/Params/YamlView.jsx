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
