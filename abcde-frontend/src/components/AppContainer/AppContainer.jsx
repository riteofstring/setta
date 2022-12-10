import React, { useEffect } from "react";
import { ReactFlowProvider } from "react-flow-renderer";
import { accessPage } from "thunks/authentication";
import HeaderContainer from "./Header/Header";
import SwitchContainer from "./SwitchContainer/SwitchContainer";

const AppContainer = () => {
  useEffect(() => {
    accessPage({ address: "" });
  }, []);

  return (
    <ReactFlowProvider>
      <HeaderContainer />
      <GridContainer>
        <SwitchContainer />
      </GridContainer>
    </ReactFlowProvider>
  );
};

function GridContainer(props) {
  return (
    <main className="h-full w-screen border border-gray-200 overflow-hidden grid grid-cols-[1fr] grid-rows-[min-content]">
      {props.children}
    </main>
  );
}

export default React.memo(AppContainer);
