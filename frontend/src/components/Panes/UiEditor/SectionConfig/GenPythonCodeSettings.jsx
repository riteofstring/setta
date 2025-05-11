import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import { useEffect, useState } from "react";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";

export function GenPythonCodeSettings() {
  const value = useSectionInfos((x) => x.projectConfig.genCodePrefix);
  const theme = useCodeMirrorStyle();

  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value);
    }
  }, [value]);

  function onChange(v) {
    setLocalValue(v);
    debouncedSetCode(v);
  }

  //   const completionsFn = useCallback(
  //     // wrappedCompletionsFn(sectionId, null, wsCodeAreaCompletion, language),
  //     [sectionId],
  //   );

  const extensions = getExtensions({
    parentDivId: "UiEditorPane",
    language: "python",
    tabToAutocomplete: true,
    indentWithTab: true,
  });

  return (
    <article
      className="cursor-auto overflow-y-scroll [&_*]:!outline-0"
      tabIndex="0"
    >
      <CodeMirror
        value={localValue}
        theme={theme}
        extensions={extensions}
        onChange={onChange}
        indentWithTab={false} // I take care of this in getExtensions
        basicSetup={{ tabSize: 4 }}
      />
    </article>
  );
}

const debouncedSetCode = _.debounce((value) => {
  useSectionInfos.setState((state) => {
    state.projectConfig.genCodePrefix = value;
  });
  maybeIncrementProjectStateVersion(true);
}, 50);
