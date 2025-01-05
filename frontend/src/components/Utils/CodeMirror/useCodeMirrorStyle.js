import { EditorView } from "@codemirror/view";
import { githubDarkInit, githubLightInit } from "@uiw/codemirror-theme-github";
import { localStorageFns } from "state/hooks/localStorage";

const commonSettings = {
  background: "#ffffff00",
  gutterBackground: "#FFFFFF00",
  // fontFamily:
  //   "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;",
  // gutterForeground: "#4D4D4C00",
  gutterBorder: "#dddddd00",
};

const githubDarkTheme = githubDarkInit({
  settings: commonSettings,
});

const githubLightTheme = githubLightInit({
  settings: commonSettings,
});

// make styles available for DummyCodeMirror
for (const theme of [githubDarkTheme, githubLightTheme]) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(theme[1][2].value.module.rules.join("\n"));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

function boringTheme(dark, color) {
  const baseFn = dark ? githubDarkInit : githubLightInit;
  const themeOptions = customCreateTheme(baseFn({ settings: commonSettings }));
  for (const k of ["&", ".cm-content"]) {
    if (!(k in themeOptions)) {
      themeOptions[k] = {};
    }
    themeOptions[k].color = color;
  }

  const theme = EditorView.theme(themeOptions, { dark });
  return { theme, color };
}

const greenDarkTheme = boringTheme(true, "#7ee787");
const greenLightTheme = boringTheme(false, "hsla(157, 100%, 28%, 1)");

export function useCodeMirrorStyle(monochrome) {
  const [darkMode] = localStorageFns.darkMode.hook();
  return getCodeMirrorStyle(darkMode, monochrome);
}

export function getCodeMirrorStyle(darkMode, monochrome) {
  if (monochrome) {
    return darkMode ? greenDarkTheme : greenLightTheme;
  }
  return { theme: darkMode ? githubDarkTheme : githubLightTheme };
}

// https://github.com/uiwjs/react-codemirror/blob/master/themes/theme/src/index.tsx
function customCreateTheme(settings) {
  const themeOptions = {
    ".cm-gutters": {},
  };
  const baseStyle = {};
  if (settings.background) {
    baseStyle.backgroundColor = settings.background;
  }
  if (settings.backgroundImage) {
    baseStyle.backgroundImage = settings.backgroundImage;
  }
  if (settings.foreground) {
    baseStyle.color = settings.foreground;
  }
  if (settings.fontSize) {
    baseStyle.fontSize = settings.fontSize;
  }
  if (settings.background || settings.foreground) {
    themeOptions["&"] = baseStyle;
  }

  if (settings.fontFamily) {
    themeOptions["&.cm-editor .cm-scroller"] = {
      fontFamily: settings.fontFamily,
    };
  }
  if (settings.gutterBackground) {
    themeOptions[".cm-gutters"].backgroundColor = settings.gutterBackground;
  }
  if (settings.gutterForeground) {
    themeOptions[".cm-gutters"].color = settings.gutterForeground;
  }
  if (settings.gutterBorder) {
    themeOptions[".cm-gutters"].borderRightColor = settings.gutterBorder;
  }

  if (settings.caret) {
    themeOptions[".cm-content"] = {
      caretColor: settings.caret,
    };
    themeOptions[".cm-cursor, .cm-dropCursor"] = {
      borderLeftColor: settings.caret,
    };
  }
  let activeLineGutterStyle = {};
  if (settings.gutterActiveForeground) {
    activeLineGutterStyle.color = settings.gutterActiveForeground;
  }
  if (settings.lineHighlight) {
    themeOptions[".cm-activeLine"] = {
      backgroundColor: settings.lineHighlight,
    };
    activeLineGutterStyle.backgroundColor = settings.lineHighlight;
  }
  themeOptions[".cm-activeLineGutter"] = activeLineGutterStyle;

  if (settings.selection) {
    themeOptions[
      "&.cm-focused .cm-selectionBackground, & .cm-line::selection, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection"
    ] = {
      background: settings.selection + " !important",
    };
  }
  if (settings.selectionMatch) {
    themeOptions["& .cm-selectionMatch"] = {
      backgroundColor: settings.selectionMatch,
    };
  }

  return themeOptions;
}
