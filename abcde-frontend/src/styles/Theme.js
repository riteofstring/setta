import { extendTheme } from "@chakra-ui/react";
export const AppTheme = extendTheme({
  styles: {
    global: {
      body: {
        overflow: "hidden",
        scrollbarWidth: "thin",
        scrollbarColor: "gray.300 transparent",
        scrollbarHeight: "thin",
      },
      "body::-webkit-scrollbar": {
        width: "0.5rem",
        height: "0.5rem",
      },
      "body *::-webkit-scrollbar": {
        width: "0.5rem",
        height: "0.5rem",
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
        background: "gray.50",
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
