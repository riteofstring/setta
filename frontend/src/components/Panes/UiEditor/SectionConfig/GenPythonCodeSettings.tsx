import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { wrappedCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import { useCallback } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { res200, ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_gen_code_prefix_completion,
  route_gen_code_suffix_completion,
  route_set_gen_code_prefix,
  route_set_gen_code_suffix,
} from "utils/generatedEndpoints";
import {
  CodeMirrorCompletion,
  GenCodePrefixCompletionRequest,
} from "utils/generatedTypes";

function GenCodeEditor({
  label,
  value,
  completionRoute,
  onChange,
}: {
  label: string;
  value: string;
  completionRoute: (
    x: GenCodePrefixCompletionRequest | GenCodePrefixCompletionRequest,
  ) => Promise<ResponseDataAndStatus<Array<CodeMirrorCompletion>>>;
  onChange: (x: string) => void;
}) {
  const theme = useCodeMirrorStyle();

  const debouncedSetGlobalState = useCallback(
    _.debounce((v) => {
      onChange(v);
    }, 50),
    [onChange],
  );

  const completionsFn = useCallback(() => {
    const fn = async (fullText: string, position: number) => {
      const projectConfigId = getCurrProjectConfigId();
      const res = await completionRoute({
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
  }, [completionRoute]);

  const extensions = getExtensions({
    parentDivId: "UiEditorPane",
    language: "python",
    tabToAutocomplete: true,
    indentWithTab: true,
    completionsFn: completionsFn(),
  });

  return (
    <div>
      <h3 className="text-xs font-bold text-setta-700 dark:text-setta-300">
        {label}
      </h3>
      <article
        className="cursor-auto overflow-y-scroll [&_*]:!outline-0"
        tabIndex={0}
      >
        <CodeMirror
          value={value}
          theme={theme}
          extensions={extensions}
          onChange={debouncedSetGlobalState}
          indentWithTab={false} // I take care of this in getExtensions
          basicSetup={{ tabSize: 4 }}
        />
      </article>
    </div>
  );
}

// Main component using the generic editor twice
export function GenPythonCodeSettings() {
  const { prefixValue, suffixValue } = useProjectState(
    (x) => ({
      prefixValue: x.projectConfig.genCodePrefix,
      suffixValue: x.projectConfig.genCodeSuffix,
    }),
    _.isEqual,
  );

  return (
    <div className="flex flex-col gap-4">
      <GenCodeEditor
        label="Code Prefix"
        value={prefixValue}
        completionRoute={route_gen_code_prefix_completion}
        onChange={setGenCodePrefix}
      />

      <GenCodeEditor
        label="Code Suffix"
        value={suffixValue}
        completionRoute={route_gen_code_suffix_completion}
        onChange={setGenCodeSuffix}
      />
    </div>
  );
}

export function setGenCodePrefix(value: string) {
  route_set_gen_code_prefix({
    projectConfigId: getCurrProjectConfigId(),
    genCodePrefix: value,
  });
}

export function setGenCodeSuffix(value: string) {
  route_set_gen_code_suffix({
    projectConfigId: getCurrProjectConfigId(),
    genCodeSuffix: value,
  });
}
