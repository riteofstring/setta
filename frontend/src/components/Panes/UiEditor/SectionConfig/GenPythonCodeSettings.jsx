import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { getCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useSectionInfos } from "state/definitions";

export function GenPythonCodeSettings() {
  const genCodePrefix = useSectionInfos((x) => x.projectConfig.genCodePrefx);

  const theme = useCodeMirrorStyle();

  const completionsFn = useCallback(
    getCompletionsFn(sectionId, null, wsCodeAreaCompletion, language),
    [sectionId],
  );


  const extensions = getExtensions({
    sectionId,
    language: "python",
    completionsFn,
    keywordStylizer,
    onEscape: onEscapeFocusOnArticleDiv,
    tabToAutocomplete: true,
    indentWithTab: true,
    isDisabled: variantIsFrozen,
  });

  return (
    <article
      ref={ref}
      className="cursor-auto overflow-y-scroll [&_*]:!outline-0"
      tabIndex="0"
    >
      <CodeMirror
        value={genCodePrefix}
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
