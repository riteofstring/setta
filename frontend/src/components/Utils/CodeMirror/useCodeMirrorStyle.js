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

function monochromeInit(dark, color) {
  const fn = dark ? githubDarkInit : githubLightInit;
  // Start with the light theme base
  const baseTheme = fn({
    settings: {
      // foreground: color, // This sets the base text color
    },
    // Override all syntax highlighting styles to use the same color
    styles: [],
  });
  return baseTheme;
}

const greenDarkTheme = monochromeInit(true, "#7ee787");
const greenLightTheme = monochromeInit(false, "hsla(157, 100%, 28%, 1)");

// make styles available for DummyCodeMirror
for (const theme of [
  githubDarkTheme,
  githubLightTheme,
  greenDarkTheme,
  greenLightTheme,
]) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(theme[1][2].value.module.rules.join("\n"));
  console.log("sheet", sheet)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export function useCodeMirrorStyle(monochrome) {
  const [darkMode] = localStorageFns.darkMode.hook();
  return getCodeMirrorStyle(darkMode, monochrome);
}

export function getCodeMirrorStyle(darkMode, monochrome) {
  if (monochrome) {
    return darkMode ? greenDarkTheme : greenLightTheme;
  }
  return darkMode ? githubDarkTheme : githubLightTheme;
}
