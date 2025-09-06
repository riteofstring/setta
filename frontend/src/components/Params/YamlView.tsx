import CodeMirror from "@uiw/react-codemirror";
import {
  codeAreaTabOnEnterKeyHandlers,
  useCodeAreaHeight,
} from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { getCurrSectionVariantId } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";

export function SectionYamlView({ sectionId }: { sectionId: string }) {
  // const isDisabled = useProjectState(
  //   (x) => getSectionVariant(sectionId, x).isFrozen,
  // );
  const isDisabled = false;

  function onChange() {
    // debouncedYamlToGUI(sectionId);
    console.log("SectionYamlView onChange");
  }

  return (
    <YamlView
      sectionId={sectionId}
      isDisabled={isDisabled}
      onChange={onChange}
    />
  );
}

function YamlView({ sectionId, isDisabled, onChange }) {
  const yamlValue = useProjectState((state) => {
    const variantId = getCurrSectionVariantId(state, sectionId, true);
    return state.yamlValues[variantId] ?? "";
  });

  const [localValue, setLocalValue] = useLocalPendingValue(yamlValue);

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);

  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({
    parentDivId: `${sectionId}-CustomResizable`,
    language: "yaml",
    indentWithTab: true,
    onEscape: onEscapeFocusOnArticleDiv,
    isDisabled,
  });

  function localOnChange(v) {
    setLocalValue(v);
    onChange?.();
  }

  // We need this class to avoid double scrollbars in GlobalParamSweepArea.
  // But we don't apply it when we're resizing because doing so causes
  // the scrollTop logic in useCodeAreaHeight to break.
  // (It ends up always scrolling to the top after resizing.)
  const cmEditorClass = overflow === "" ? "[&_.cm-editor]:h-full" : "";

  return (
    <article
      ref={wrapperRef}
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag section-full-no-title min-h-0 cursor-auto [&_*]:!outline-0 [&_.cm-theme]:h-full ${cmEditorClass} ${overflow} ${nowheel}`}
      onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
      tabIndex={0}
    >
      <CodeMirror
        maxHeight={maxHeight}
        value={localValue}
        onChange={localOnChange}
        theme={theme}
        extensions={extensions}
        onCreateEditor={handleCreateEditor}
        indentWithTab={false}
        basicSetup={{ tabSize: 4 }}
      />
    </article>
  );
}
