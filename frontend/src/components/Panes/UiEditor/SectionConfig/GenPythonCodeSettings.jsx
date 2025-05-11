import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useSectionInfos } from "state/definitions";

export function GenPythonCodeSettings() {
  const genCodePrefix = useSectionInfos((x) => x.projectConfig.genCodePrefix);
  const theme = useCodeMirrorStyle();

  function onChange(v) {
    useSectionInfos.setState((state) => {
      state.projectConfig.genCodePrefix = v;
    });
  }

  //   const completionsFn = useCallback(
  //     // wrappedCompletionsFn(sectionId, null, wsCodeAreaCompletion, language),
  //     [sectionId],
  //   );

  const extensions = getExtensions({
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
        value={genCodePrefix}
        theme={theme}
        extensions={extensions}
        onChange={onChange}
        indentWithTab={false} // I take care of this in getExtensions
        basicSetup={{ tabSize: 4 }}
      />
    </article>
  );
}

// function getTextFieldCompletionsFn(sectionId, paramInfoId, language) {
//   const fn = async (fullText, position) => {
//     const res = await wsTextFieldCompletion({
//       sectionId,
//       paramInfoId,
//       fullText,
//       position,
//     });

//     setToNotWaiting();

//     return res;
//   };

//   return wrappedCompletionsFn(fn, language);
// }
