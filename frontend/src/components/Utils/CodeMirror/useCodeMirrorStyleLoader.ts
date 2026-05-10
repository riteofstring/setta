import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useState } from "react";
import { getCodeMirrorStyle } from "./useCodeMirrorStyle";

type CodeMirrorStyleLoaderTheme = {
  readonly darkMode: boolean;
  readonly color: string | undefined;
};

// A lot of the time, we render only dummy codemirror components.
// Those components depend on codemirror css classes, which only load when an actual codemirror component renders.
// So this is a hack to get those css styles to load when a project is opened.
// It adds a codemirror div, goes through all the combinations of themes, and then immediately removes the div.
export function useCodeMirrorStyleLoader(doneLoading: boolean, is404: boolean) {
  const [containerState, setContainerState] = useState<HTMLDivElement | null>(
    null,
  );
  const [view, setView] = useState<EditorView | null>(null);

  useEffect(() => {
    if (!doneLoading || is404) {
      return;
    }

    // Create an off-screen container
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    document.body.appendChild(container);

    // Define all theme combinations to iterate through
    const themeConfigs: CodeMirrorStyleLoaderTheme[] = [
      { darkMode: true, color: undefined },
      { darkMode: false, color: undefined },
      { darkMode: true, color: "green" },
      { darkMode: false, color: "green" },
    ];
    const initialConfig = themeConfigs[0];
    if (!initialConfig) {
      return;
    }

    // Create initial view with first theme
    const initialTheme = getCodeMirrorStyle(
      initialConfig.darkMode,
      initialConfig.color,
    );
    const newView = new EditorView({
      state: EditorState.create({ extensions: [initialTheme] }),
      parent: container,
    });

    // Iterate through remaining themes
    for (const { darkMode, color } of themeConfigs.slice(1)) {
      const theme = getCodeMirrorStyle(darkMode, color);

      // Create new state with updated theme
      const newState = EditorState.create({
        extensions: [theme],
      });

      // Update the view with the new state
      newView.setState(newState);
    }

    setContainerState(container);
    setView(newView);

    return () => {
      newView.destroy();
      try {
        document.body.removeChild(container);
      } catch {
        // The container may already have been removed by the eager cleanup effect.
      }
    };
  }, [doneLoading, is404]);

  // Immediately unmount the component after mounting and cycling through themes
  useEffect(() => {
    if (view && containerState) {
      view.destroy();
      if (document.body.contains(containerState)) {
        document.body.removeChild(containerState);
      }
    }
  }, [view]);

  return null;
}
