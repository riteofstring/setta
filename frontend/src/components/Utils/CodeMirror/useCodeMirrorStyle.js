import { tags as t } from "@lezer/highlight";
import {
  defaultSettingsGithubDark,
  defaultSettingsGithubLight,
  githubDarkInit,
  githubLightInit,
} from "@uiw/codemirror-theme-github";
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

function boringTheme(darkMode, color) {
  const defaultSettingsGithub = darkMode
    ? defaultSettingsGithubDark
    : defaultSettingsGithubLight;

  return createTheme({
    theme: darkMode ? "dark" : "light",
    settings: { ...defaultSettingsGithub, ...commonSettings },
    styles: [
      // Base tags
      { tag: t.content, color },
      { tag: t.contentSeparator, color },
      { tag: t.emphasis, color },
      { tag: t.heading, color },
      { tag: t.strong, color },
      { tag: t.atom, color },
      { tag: t.meta, color },
      { tag: t.link, color },
      { tag: t.processing, color },

      // Comments and documentation
      { tag: t.comment, color },
      { tag: t.lineComment, color },
      { tag: t.blockComment, color },
      { tag: t.docComment, color },

      // Variable and property names
      { tag: t.variableName, color },
      { tag: t.propertyName, color },
      { tag: t.definition(t.variableName), color },
      { tag: t.definition(t.propertyName), color },
      { tag: t.special(t.variableName), color },
      { tag: t.special(t.propertyName), color },

      // Types and classes
      { tag: t.typeName, color },
      { tag: t.className, color },
      { tag: t.labelName, color },
      { tag: t.namespace, color },
      { tag: t.definition(t.typeName), color },
      { tag: t.definition(t.className), color },
      { tag: t.definition(t.labelName), color },

      // Functions and methods
      { tag: t.function(t.variableName), color },
      { tag: t.function(t.propertyName), color },
      { tag: t.functionName, color },
      { tag: t.macroName, color },

      // Literals
      { tag: t.string, color },
      { tag: t.special(t.string), color },
      { tag: t.number, color },
      { tag: t.integer, color },
      { tag: t.float, color },
      { tag: t.unit, color },
      { tag: t.bool, color },
      { tag: t.null, color },
      { tag: t.regexp, color },
      { tag: t.character, color },

      // Keywords and operators
      { tag: t.keyword, color },
      { tag: t.moduleKeyword, color },
      { tag: t.operatorKeyword, color },
      { tag: t.operator, color },
      { tag: t.compareOperator, color },
      { tag: t.arithmeticOperator, color },
      { tag: t.logicOperator, color },
      { tag: t.punctuation, color },
      { tag: t.separator, color },
      { tag: t.derefOperator, color },
      { tag: t.typeOperator, color },

      // Brackets and delimiters
      { tag: t.bracket, color },
      { tag: t.squareBracket, color },
      { tag: t.paren, color },
      { tag: t.brace, color },
      { tag: t.special(t.brace), color },
      { tag: t.angleBracket, color },

      // Markup and templates
      { tag: t.tagName, color },
      { tag: t.attributeName, color },
      { tag: t.attributeValue, color },
      { tag: t.quote, color },
      { tag: t.inserted, color },
      { tag: t.deleted, color },
      { tag: t.changed, color },
      { tag: t.invalid, color },
      { tag: t.definition(t.tagName), color },
      { tag: t.definition(t.attributeName), color },

      // URL and paths
      { tag: t.url, color },
      { tag: t.escape, color },

      // Catch-all for any remaining tags
      { tag: t.standard(t.tagName), color },
      { tag: t.special(t.tagName), color },
      { tag: t.definition(t.standard(t.tagName)), color },
      { tag: t.definition(t.special(t.tagName)), color },
    ],
  });
}

const githubDarkTheme = githubDarkInit({
  settings: commonSettings,
});

const githubLightTheme = githubLightInit({
  settings: commonSettings,
});

const greenDarkTheme = boringTheme(true, "#7ee787");
const greenLightTheme = boringTheme(false, "hsla(157, 100%, 28%, 1)");

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
  return getCodeMirrorStyle(darkMode, color);
}

export function getCodeMirrorStyle(darkMode, color) {
  if (color === "green") {
    return darkMode ? greenDarkTheme : greenLightTheme;
  }
  return darkMode ? githubDarkTheme : githubLightTheme;
}
