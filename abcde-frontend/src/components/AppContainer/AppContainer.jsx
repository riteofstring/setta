import React from "react";
import { ReactFlowProvider } from "react-flow-renderer";
import HeaderContainer from "./Header/Header";
import SwitchContainer from "./SwitchContainer/SwitchContainer";

const AppContainer = () => {
  return (
    <ReactFlowProvider>
      <HeaderContainer />
      <GridContainer>
        <SwitchContainer />
      </GridContainer>
    </ReactFlowProvider>
  );
};

function GridContainer({ children }) {
  return (
    <main className="h-full w-screen border border-gray-200 overflow-hidden grid grid-cols-[1fr] grid-rows-[min-content]">
      {children}
    </main>
  );
}

export default React.memo(AppContainer);
