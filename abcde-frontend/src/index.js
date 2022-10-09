import { ChakraProvider } from "@chakra-ui/react";
import { StoreProvider, useStoreRehydrated } from "easy-peasy";
import React from "react";
import ReactDOM from "react-dom";
import store from "store/store";
import { AppTheme } from "styles/Theme";

import App from "./App";
import "./index.css";
import reportWebVitals from "./reportWebVitals";

function WaitForStateRehydration({ children }) {
  const isRehydrated = useStoreRehydrated();
  return isRehydrated ? children : null;
}

ReactDOM.render(
  <React.StrictMode>
    <ChakraProvider theme={AppTheme}>
      <StoreProvider store={store}>
        <WaitForStateRehydration>
          <App />
        </WaitForStateRehydration>
      </StoreProvider>
    </ChakraProvider>
  </React.StrictMode>,
  document.getElementById("root")
);

reportWebVitals();
