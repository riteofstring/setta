import { ChakraProvider } from "@chakra-ui/react";
import { StoreProvider, useStoreRehydrated } from "easy-peasy";
import React from "react";
import { createRoot } from "react-dom/client";
import store from "store/store";
import { AppTheme } from "styles/Theme";
import App from "./App";
import "./index.css";
import reportWebVitals from "./reportWebVitals";

function WaitForStateRehydration({ children }) {
  const isRehydrated = useStoreRehydrated();
  return isRehydrated ? children : null;
}

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ChakraProvider theme={AppTheme}>
      <StoreProvider store={store}>
        <WaitForStateRehydration>
          <App />
        </WaitForStateRehydration>
      </StoreProvider>
    </ChakraProvider>
  </React.StrictMode>
);

reportWebVitals();
