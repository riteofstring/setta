import { HighlightStyle } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { githubDarkInit, githubLightInit } from "@uiw/codemirror-theme-github";
import { useWorkspaceAppearance } from "../../document/stores";

// The reference's `useCodeMirrorStyle` GitHub idle path over its transparent common settings.
// The green "boring" theme variant serves application-only surfaces and stays
// application-side; appearance rides the package appearance store instead of the reference's
// local-storage store.

const commonSettings = {
  background: "#ffffff00",
  gutterBackground: "#FFFFFF00",
  gutterBorder: "#dddddd00",
};

// Module singletons: the dummy layer's highlight classes must be the same instances the live
// editor and the style mount below register, or the class names would not line up.
const githubDarkTheme = githubDarkInit({ settings: commonSettings });
const githubLightTheme = githubLightInit({ settings: commonSettings });

export type TextValueTheme = Extension;

export function useTextValueTheme(): TextValueTheme {
  const darkMode = useWorkspaceAppearance((x) => x.darkMode);
  return darkMode ? githubDarkTheme : githubLightTheme;
}

type FacetProviderLike = { value: unknown };

function isFacetProviderLike(candidate: unknown): candidate is FacetProviderLike {
  return typeof candidate === "object" && candidate !== null && "value" in candidate;
}

function getThemeSlot(theme: TextValueTheme, group: number, index: number): unknown {
  if (!Array.isArray(theme)) {
    throw new Error("The text value theme is not the expected extension group array.");
  }
  const groupExtensions: unknown = theme[group];
  if (!Array.isArray(groupExtensions)) {
    return undefined;
  }
  const slot: unknown = groupExtensions[index];
  if (!isFacetProviderLike(slot)) {
    return undefined;
  }
  return slot.value;
}

// The reference dummy's `theme[1][2].value` extraction: the highlight style the live editor
// registers, reused by `highlightTree` so idle markup carries the same classes.
export function getThemeHighlightStyle(theme: TextValueTheme): HighlightStyle {
  const highlightStyle = getThemeSlot(theme, 1, 2);
  if (!(highlightStyle instanceof HighlightStyle)) {
    throw new Error("The text value theme did not expose its highlight style.");
  }
  return highlightStyle;
}

// The reference dummy's `theme[0][0]?.value || ""` scope-class extraction ("ͼ1 ͼ3 ...").
export function getThemeScopeClassName(theme: TextValueTheme): string {
  const scopeClassName = getThemeSlot(theme, 0, 0);
  return typeof scopeClassName === "string" ? scopeClassName : "";
}

let textValueThemeStylesMounted = false;

// The reference's `useCodeMirrorStyleLoader` trimmed to the two GitHub themes: dummy layers
// depend on CodeMirror css classes that only mount when a real editor instantiates them, so
// the first control mounts an off-screen view once per document and immediately destroys it.
// The injected style rules outlive the view.
export function mountTextValueThemeStyles(): void {
  if (textValueThemeStylesMounted) {
    return;
  }
  textValueThemeStylesMounted = true;
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  document.body.appendChild(container);
  const view = new EditorView({
    state: EditorState.create({ extensions: [githubLightTheme] }),
    parent: container,
  });
  view.setState(EditorState.create({ extensions: [githubDarkTheme] }));
  view.destroy();
  document.body.removeChild(container);
}
