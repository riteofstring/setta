import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useState } from "react";
import { localStorageFns } from "state/hooks/localStorage";
import { getCodeMirrorStyle } from "./useCodeMirrorStyle";

// A lot of the time, we render only dummy codemirror components.
// But some css styles don't seem to load until an actual codemirror component renders.
// So this is a hack to get those css styles to load when a project is opened.
// It adds a codemirror div and then immediately removes it.
export function useCodeMirrorStyleLoader(doneLoading) {
  const [containerState, setContainerState] = useState(null);
  const [view, setView] = useState(null);

  useEffect(() => {
    if (!doneLoading) {
      return;
    }
    const darkMode = localStorageFns.darkMode.state();
    const theme = getCodeMirrorStyle(darkMode);
    // Create an off-screen container
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    document.body.appendChild(container);

    // Create and mount a CodeMirror instance
    const newView = new EditorView({
      state: EditorState.create({ extensions: [theme] }),
      parent: container,
    });

    setContainerState(container);
    setView(newView);

    // Cleanup function
    return () => {
      newView.destroy();
      try {
        document.body.removeChild(container);
      } catch {}
    };
  }, [doneLoading]);

  // Immediately unmount the component after mounting
  useEffect(() => {
    if (view) {
      view.destroy();
      if (document.body.contains(containerState)) {
        document.body.removeChild(containerState);
      }
    }
  }, [view]);

  return null;
}
