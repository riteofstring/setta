import { ChakraProvider } from "@chakra-ui/react";
import React from "react";
import ReactDOM from "react-dom";
import { AppTheme } from "styles/Theme";
import App from "./App";
import "./index.css";
import reportWebVitals from "./reportWebVitals";

// change to ReactDom.createRoot();

ReactDOM.render(
  <React.StrictMode>
    <ChakraProvider theme={AppTheme}>
      <App />
    </ChakraProvider>
  </React.StrictMode>,
  document.getElementById("root")
);

reportWebVitals();
