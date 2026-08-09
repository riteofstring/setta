import { HighlightStyle } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  defaultSettingsGithubDark,
  defaultSettingsGithubLight,
  githubDarkInit,
  githubLightInit,
} from "@uiw/codemirror-theme-github";
import { createTheme } from "@uiw/codemirror-themes";
import { useWorkspaceAppearance } from "../../document/stores";

// The reference's `useCodeMirrorStyle` themes over its transparent common settings. The value
// editor uses the GitHub theme; the editable item-name control uses the same green "boring"
// theme as `ParamNameInput`. Appearance rides the package appearance store instead of the
// reference's local-storage store.

const commonSettings = {
  background: "#ffffff00",
  gutterBackground: "#FFFFFF00",
  gutterBorder: "#dddddd00",
};

// Module singletons: the dummy layer's highlight classes must be the same instances the live
// editor and the style mount below register, or the class names would not line up.
const githubDarkTheme = githubDarkInit({ settings: commonSettings });
const githubLightTheme = githubLightInit({ settings: commonSettings });
const greenDarkTheme = createGreenTheme(true, "#7ee787");
const greenLightTheme = createGreenTheme(false, "hsla(157, 100%, 28%, 1)");

export type TextValueTheme = Extension;
export type TextValueThemeColor = "github" | "green";

function createGreenTheme(darkMode: boolean, color: string): TextValueTheme {
  const githubSettings = darkMode ? defaultSettingsGithubDark : defaultSettingsGithubLight;
  return createTheme({
    theme: darkMode ? "dark" : "light",
    settings: { ...githubSettings, ...commonSettings },
    styles: [
      { tag: [tags.comment, tags.bracket], color },
      { tag: tags.variableName, color },
      { tag: [tags.string, tags.special(tags.brace)], color },
      { tag: tags.number, color },
      { tag: tags.bool, color },
      { tag: tags.null, color },
      { tag: tags.keyword, color },
      { tag: tags.operator, color },
      { tag: tags.className, color },
      { tag: tags.definition(tags.typeName), color },
      { tag: tags.typeName, color },
      { tag: tags.angleBracket, color },
      { tag: tags.tagName, color },
      { tag: tags.attributeName, color },
    ],
  });
}

export function useTextValueTheme(color: TextValueThemeColor = "github"): TextValueTheme {
  const darkMode = useWorkspaceAppearance((x) => x.darkMode);
  if (color === "green") {
    return darkMode ? greenDarkTheme : greenLightTheme;
  }
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
// the first control mounts an off-screen view once per document and immediately cycles through
// all four reference themes. The injected style rules outlive the view.
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
  view.setState(EditorState.create({ extensions: [greenLightTheme] }));
  view.setState(EditorState.create({ extensions: [greenDarkTheme] }));
  view.destroy();
  document.body.removeChild(container);
}
