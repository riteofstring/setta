import { useEffect, useState } from "react";
import { HiMoon } from "react-icons/hi";
import { RiSunFill } from "react-icons/ri";

export default function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Check if user has a preference saved in localStorage
    const savedTheme = localStorage.getItem("darkMode");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;

    if (savedTheme === "true" || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    if (darkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("darkMode", "false");
      setDarkMode(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("darkMode", "true");
      setDarkMode(true);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-end">
      <button
        onClick={toggleTheme}
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-setta-100 dark:hover:bg-setta-800"
        aria-label="Toggle dark mode"
      >
        {darkMode ? (
          <HiMoon className="h-5 w-5 text-setta-400" />
        ) : (
          <RiSunFill className="h-5 w-5 text-setta-600" />
        )}
      </button>
    </div>
  );
}
