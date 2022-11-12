import { ChakraProvider } from "@chakra-ui/react";
import { StoreProvider, useStoreRehydrated } from "easy-peasy";
import React from "react";
import ReactDOM from "react-dom";
import { RouterProvider } from "react-router-dom";
import store from "store/store";
import { AppTheme } from "styles/Theme";
import { router } from "utils/Router/createRouter";
import "./index.css";
import reportWebVitals from "./reportWebVitals";

function WaitForStateRehydration({ children }) {
  const isRehydrated = useStoreRehydrated();
  return isRehydrated ? children : null;
}

// TODO: change to ReactDom.createRoot();

ReactDOM.render(
  <React.StrictMode>
    <StoreProvider store={store}>
      <WaitForStateRehydration>
        <ChakraProvider theme={AppTheme}>
          <RouterProvider router={router} />
        </ChakraProvider>
      </WaitForStateRehydration>
    </StoreProvider>
  </React.StrictMode>,
  document.getElementById("root")
);

reportWebVitals();
