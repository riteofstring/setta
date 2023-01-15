import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import { router } from "utils/Routes/rootRouter";

const AppContainer = () => {
  return <RouterProvider router={router} />;
};

{
  /* <ReactFlowProvider>
      //   <HeaderContainer />
      //   <GridContainer>{/* <SwitchContainer /> */
}
// </ReactFlowProvider> */}

export default React.memo(AppContainer);
