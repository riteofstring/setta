import { useReactFlow } from "forks/xyflow/core/store";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";

function fixPlaceholderCursor(divId, value, defaultVal) {
  // The cursor appears the wrong size when there's a placeholder text and when you're zoomed in.
  // This is a hacky solution to that problem.
  if (!value && defaultVal) {
    const divs = document.querySelectorAll(`#${divId} .cm-cursor`);
    divs.forEach((div) => {
      div.style.height = `${14 * useReactFlow.getState().transform[2]}px`;
    });
  }
}

export function getOnCreateEditor({
  initialEvent,
  setRealIsInitialized,
  divId,
  value,
  defaultVal,
}) {
  return (view) => {
    view.focus();
    if (initialEvent !== "tab") {
      const { clientX, clientY } = initialEvent;
      const pos = view.posAtCoords({ x: clientX, y: clientY });
      view.dispatch({ selection: { anchor: pos, head: pos } });
    }

    fixPlaceholderCursor(divId, value, defaultVal);
    setRealIsInitialized(true);
  };
}

function getFromTo(options, before, context) {
  for (const opt of options) {
    if (opt.from) {
      return { from: opt.from, to: opt.to };
    }
  }
  return { from: before ? before.from : context.pos };
}

export function getCompletionsFn(
  sectionId,
  paramInfoId,
  completionFn,
  language,
) {
  if (language === "python") {
    return async (context) => {
      const fullText = context.state.doc.toString();
      if (!fullText.trim()) return null;
      // TODO: implement this
      // context.addEventListener(
      //   "abort",
      //   () => {
      //     console.log("aborted");
      //   },
      //   { onDocChange: true },
      // );
      const before = context.matchBefore(/([^.=\\(+-\/ ]*)$/);
      const setToNotWaiting = setTextFieldWaitingForLSP({
        sectionId,
        paramInfoId,
      });
      const res = await completionFn({
        sectionId,
        paramInfoId,
        fullText,
        position: context.pos,
      });
      setToNotWaiting();
      if (res) {
        return {
          filter: true,
          ...getFromTo(res, before, context),
          options: res,
          // validFor: /([^.=\\(]*)$/,
        };
      }
      return null;
    };
  }

  return () => null;
}
