import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { wrappedCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_gen_code_prefix_completion } from "utils/generatedEndpoints";

export function GenPythonCodeSettings() {
  const value = useProjectState((x) => x.projectConfig.genCodePrefix);
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

  const completionsFn = useCallback(getGenCodePrefixCompletionsFn(), []);

  const extensions = getExtensions({
    parentDivId: "UiEditorPane",
    language: "python",
    tabToAutocomplete: true,
    indentWithTab: true,
    completionsFn,
  });

  return (
    <article
      className="cursor-auto overflow-y-scroll [&_*]:!outline-0"
      tabIndex={0}
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
  setGenCodePrefix({ value });
}, 50);

function getGenCodePrefixCompletionsFn() {
  const fn = async (fullText: string, position: number) => {
    const projectConfigId = useProjectState.getState().projectConfig.id;
    const res = await route_gen_code_prefix_completion({
      projectConfigId,
      fullText,
      position,
    });

    if (res200(res)) {
      return res.data;
    }
    return [];
  };

  return wrappedCompletionsFn(fn);
}

export function setGenCodePrefix({ value }) {
  useProjectState.setState((state) => {
    state.projectConfig.genCodePrefix = value;
  });
  maybeIncrementProjectStateVersion(true);
}
