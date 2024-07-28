import { tags as t } from "@lezer/highlight";
import { githubDarkInit, githubLightInit } from "@uiw/codemirror-theme-github";
import { createTheme } from "@uiw/codemirror-themes";
import { localStorageFns } from "state/hooks/localStorage";

const commonSettings = {
  background: "#ffffff00",
  gutterBackground: "#FFFFFF00",
  // fontFamily:
  //   "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;",
  // gutterForeground: "#4D4D4C00",
  gutterBorder: "#dddddd00",
};

const LightStyle = [
  { tag: [t.standard(t.tagName), t.tagName], color: "#116329" },
  { tag: [t.comment, t.bracket], color: "#6a737d" },
  { tag: [t.className, t.propertyName], color: "#6f42c1" },
  {
    tag: [t.variableName, t.attributeName, t.number, t.operator],
    color: "#005cc5",
  },
  {
    tag: [t.keyword, t.typeName, t.typeOperator, t.typeName],
    color: "#d73a49",
  },
  { tag: [t.string, t.meta, t.regexp], color: "#032f62" },
  { tag: [t.name, t.quote], color: "#22863a" },
  { tag: [t.heading, t.strong], color: "#24292e", fontWeight: "bold" },
  { tag: [t.emphasis], color: "#24292e", fontStyle: "italic" },
  { tag: [t.deleted], color: "#b31d28", backgroundColor: "ffeef0" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#e36209" },
  { tag: [t.url, t.escape, t.regexp, t.link], color: "#032f62" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "#cb2431" },
];

export const githubDarkStyle = [
  { tag: [t.standard(t.tagName), t.tagName], color: "#7ee787" },
  { tag: [t.comment, t.bracket], color: "#8b949e" },
  { tag: [t.className, t.propertyName], color: "#d2a8ff" },
  {
    tag: [t.variableName, t.attributeName, t.number, t.operator],
    color: "#79c0ff",
  },
  {
    tag: [t.keyword, t.typeName, t.typeOperator, t.typeName],
    color: "#ff7b72",
  },
  { tag: [t.string, t.meta, t.regexp], color: "#a5d6ff" },
  { tag: [t.name, t.quote], color: "#7ee787" },
  { tag: [t.heading, t.strong], color: "#d2a8ff", fontWeight: "bold" },
  { tag: [t.emphasis], color: "#d2a8ff", fontStyle: "italic" },
  { tag: [t.deleted], color: "#ffdcd7", backgroundColor: "ffeef0" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#ffab70" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "#f97583" },
];

function boringTheme(color) {
  return createTheme({
    settings: commonSettings,
    styles: [
      { tag: t.comment, color },
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

const githubDarkTheme = githubDarkInit({
  settings: commonSettings,
});

const githubLightTheme = githubLightInit({
  settings: commonSettings,
});

const greenDarkTheme = boringTheme("#7ee787");
const greenLightTheme = boringTheme("hsla(157, 100%, 28%, 1)");

// make styles available for DummyCodeMirror
for (const theme of [
  githubDarkTheme,
  githubLightTheme,
  greenDarkTheme,
  greenLightTheme,
]) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(theme[1][2].value.module.rules.join("\n"));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export function useCodeMirrorStyle(color) {
  const [darkMode] = localStorageFns.darkMode.hook();
  if (color === "green") {
    return darkMode ? greenDarkTheme : greenLightTheme;
  }
  return darkMode ? githubDarkTheme : githubLightTheme;
}
