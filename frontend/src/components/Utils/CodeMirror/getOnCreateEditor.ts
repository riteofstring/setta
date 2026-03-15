import { Completion, CompletionSource } from "@codemirror/autocomplete";
import { useReactFlow } from "forks/xyflow/core/store";

function fixPlaceholderCursor(view, value, defaultVal) {
  // The cursor appears the wrong size when there's a placeholder text and when you're zoomed in.
  // This is a hacky solution to that problem.
  if (value || !defaultVal) {
    return;
  }
  const zoom = useReactFlow.getState().transform[2];
  if (zoom === 1) {
    return;
  }
  const divs = view.dom?.querySelectorAll?.(".cm-cursor");
  if (!divs || divs.length === 0) {
    return;
  }
  divs.forEach((div) => {
    if (div instanceof HTMLElement) {
      div.style.height = `${14 * zoom}px`;
    }
  });
}

export function getOnCreateEditor({
  initialEvent,
  value,
  defaultVal,
}) {
  return (view) => {
    if (view.contentDOM?.focus) {
      view.contentDOM.focus({ preventScroll: true });
    } else {
      view.focus();
    }
    if (initialEvent !== "tab") {
      const { clientX, clientY } = initialEvent;
      const pos = view.posAtCoords({ x: clientX, y: clientY });
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos, head: pos } });
      }
    }

    fixPlaceholderCursor(view, value, defaultVal);
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

export function wrappedCompletionsFn(
  completionFn: (fullText: string, position: number) => Promise<Completion[]>,
): CompletionSource {
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
    const res = await completionFn(fullText, context.pos);
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
