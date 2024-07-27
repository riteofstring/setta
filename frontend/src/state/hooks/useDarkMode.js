import { useEffect } from "react";
import { localStorageFns } from "./localStorage";

export function useDarkMode() {
  const [darkMode] = localStorageFns.darkMode.hook();

  useEffect(() => {
    if (darkMode) {
      document.querySelector("html").classList.add("dark");
    } else {
      document.querySelector("html").classList.remove("dark");
    }
  }, [darkMode]);

  return darkMode;
}
