import { githubDarkInit, githubLightInit } from "@uiw/codemirror-theme-github";
import { useSettings } from "models/settings";

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

console.log("githubDarkTheme", githubDarkTheme[1][2].value);

const sheet = new CSSStyleSheet();
sheet.replaceSync(githubDarkTheme[1][2].value.module.rules.join("\n"));
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

export function useCodeMirrorStyle() {
  const darkMode = useSettings((x) => x.darkMode);

  return { theme: darkMode ? githubDarkTheme : githubLightTheme };
}
