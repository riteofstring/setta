import { githubDarkInit, githubLightInit } from "@uiw/codemirror-theme-github";
import { localStorageFns } from "hooks/localStorageHooks";

const githubDarkTheme = githubDarkInit({
  settings: {
    background: "#ffffff00",
    gutterBackground: "#FFFFFF00",
    // fontFamily:
    //   "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;",
    // gutterForeground: "#4D4D4C00",
    gutterBorder: "#dddddd00",
  },
});

const githubLightTheme = githubLightInit({
  settings: {
    background: "#ffffff00",
    gutterBackground: "#FFFFFF00",
    // gutterForeground: "#4D4D4C00",
    // fontFamily:
    //   "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;",
    gutterBorder: "#dddddd00",
  },
});

// make styles available for DummyCodeMirror
for (const theme of [githubDarkTheme, githubLightTheme]) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(theme[1][2].value.module.rules.join("\n"));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export function useCodeMirrorStyle() {
  const [darkMode] = localStorageFns.darkMode.hook();
  return darkMode ? githubDarkTheme : githubLightTheme;
}
