import { tags as t } from "@lezer/highlight";
import {
  defaultSettingsGithubDark,
  defaultSettingsGithubLight,
  githubDarkInit,
  githubLightInit,
} from "@uiw/codemirror-theme-github";
import { createTheme } from "@uiw/codemirror-themes";
import { useLocalStorage } from "state/definitions";

const MONOSPACE_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

type CodeMirrorStyleFontFamily = "inherit" | "monospace";

type CodeMirrorStyleOptions = {
  fontFamily?: CodeMirrorStyleFontFamily;
};

function getCommonSettings(fontFamily: string) {
  return {
    background: "#ffffff00",
    gutterBackground: "#FFFFFF00",
    fontFamily,
    // gutterForeground: "#4D4D4C00",
    gutterBorder: "#dddddd00",
  };
}

function boringTheme(darkMode: boolean, color: string, fontFamily: string) {
  const defaultSettingsGithub = darkMode
    ? defaultSettingsGithubDark
    : defaultSettingsGithubLight;
  return createTheme({
    theme: darkMode ? "dark" : "light",
    settings: { ...defaultSettingsGithub, ...getCommonSettings(fontFamily) },
    styles: [
      { tag: [t.comment, t.bracket], color },
      { tag: t.variableName, color },
      { tag: [t.string, t.special(t.brace)], color },
      { tag: t.number, color },
      { tag: t.bool, color },
      { tag: t.null, color },
      { tag: t.keyword, color },
      { tag: t.operator, color },
      { tag: t.className, color },
      { tag: t.definition(t.typeName), color },
      { tag: t.typeName, color },
      { tag: t.angleBracket, color },
      { tag: t.tagName, color },
      { tag: t.attributeName, color },
    ],
  });
}

function buildThemeSet(fontFamily: string) {
  return {
    githubDark: githubDarkInit({
      settings: getCommonSettings(fontFamily),
    }),
    githubLight: githubLightInit({
      settings: getCommonSettings(fontFamily),
    }),
    greenDark: boringTheme(true, "#7ee787", fontFamily),
    greenLight: boringTheme(false, "hsla(157, 100%, 28%, 1)", fontFamily),
  };
}

const THEMES_BY_FONT_FAMILY: Record<
  CodeMirrorStyleFontFamily,
  ReturnType<typeof buildThemeSet>
> = {
  inherit: buildThemeSet("inherit"),
  monospace: buildThemeSet(MONOSPACE_FONT_FAMILY),
};

export function useCodeMirrorStyle(
  color?: string,
  options: CodeMirrorStyleOptions = {},
) {
  const darkMode = useLocalStorage((x) => x.darkMode);
  return getCodeMirrorStyle(darkMode, color, options);
}

export function getCodeMirrorStyle(
  darkMode: boolean,
  color?: string,
  options: CodeMirrorStyleOptions = {},
) {
  const fontFamily = options.fontFamily ?? "monospace";
  const themeSet = THEMES_BY_FONT_FAMILY[fontFamily];
  if (color === "green") {
    return darkMode ? themeSet.greenDark : themeSet.greenLight;
  }
  return darkMode ? themeSet.githubDark : themeSet.githubLight;
}
