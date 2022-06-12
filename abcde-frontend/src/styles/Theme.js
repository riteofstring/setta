import { extendTheme } from "@chakra-ui/react";

import fonts from "./Fonts.js";

export const AppTheme = extendTheme({
  fonts,
  styles: {
    global: {
      body: {
        overflow: "hidden",
        scrollbarWidth: "thin",
        scrollbarColor: "gray.300 transparent",
        scrollbarHeight: "thin",
      },
      ".js-focus-visible :focus:not([data-focus-visible-added])": {
        outline: "none",
        boxShadow: "none",
      },
      "body::-webkit-scrollbar": {
        width: "0.5rem",
        height: "0.5rem",
        backgroundColor: "white",
      },
      "body *::-webkit-scrollbar": {
        width: "0.5rem",
        height: "0.5rem",
        backgroundColor: "white",
      },
      "body *": {
        scrollbarWidth: "thin",
        scrollbarHeight: "thin",
        scrollbarColor: "gray.300 transparent",
      },
      "::-webkit-scrollbar-corner": {
        background: "gray.50",
      },
      "body::-webkit-scrollbar-track": {
        background: "gray.50",
      },
      "body *::-webkit-scrollbar-track": {
        background: "white",
      },
      "body::-webkit-scrollbar-thumb": {
        backgroundColor: "gray.300",
        border: "1px solid transparent",
        borderRadius: "0.5rem",
      },
      "body *::-webkit-scrollbar-thumb": {
        backgroundColor: "gray.300",
        border: "1px solid transparent",
        borderRadius: "0.5rem",
      },
    },
  },
});
