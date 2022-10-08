import { ChakraProvider } from "@chakra-ui/react";
import { StoreProvider, useStoreRehydrated } from "easy-peasy";
import store from "store/store";
import { AppTheme } from "styles/Theme";

import Head from "next/head";
// import "../../index.css";
// import "../../styles/global.css";
// import reportWebVitals from "./reportWebVitals";

function WaitForStateRehydration({ children }) {
  const isRehydrated = useStoreRehydrated();
  return isRehydrated ? children : null;
}

export default function MyApp({ Component, pageProps }) {
  return (
    <div>
      <Head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <ChakraProvider theme={AppTheme}>
        <StoreProvider store={store}>
          <WaitForStateRehydration>
            <Component {...pageProps} />
          </WaitForStateRehydration>
        </StoreProvider>
      </ChakraProvider>
    </div>
  );
}

// reportWebVitals();

// import { ChakraProvider } from "@chakra-ui/react";
// import { StoreProvider, useStoreRehydrated } from "easy-peasy";
// import React from "react";
// import ReactDOM from "react-dom";
// import store from "store/store";
// import { AppTheme } from "styles/Theme";

// import App from "./App";
// import "./index.css";
// import reportWebVitals from "./reportWebVitals";

// function WaitForStateRehydration({ children }) {
//   const isRehydrated = useStoreRehydrated();
//   return isRehydrated ? children : null;
// }

// ReactDOM.render(
//   <React.StrictMode>
//     <ChakraProvider theme={AppTheme}>
//       <StoreProvider store={store}>
//         <WaitForStateRehydration>
//           <App />
//         </WaitForStateRehydration>
//       </StoreProvider>
//     </ChakraProvider>
//   </React.StrictMode>,
//   document.getElementById("root")
// );

// reportWebVitals();
