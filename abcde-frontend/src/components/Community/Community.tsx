import { FlexWrapper } from "components/AppContainer/FlexWrapper/FlexWrapper";
import { HeaderContainer } from "components/AppContainer/Header/Header";
import { Resizable } from "re-resizable";

export function CommunityPage() {
  return (
    <FlexWrapper>
      <HeaderContainer />
      <div className="flex h-[calc(100vh_-_56px)] bg-blue-300 px-11 py-12 ">
        <TemplateListPane />
        <TemplateDetailPane />
      </div>
    </FlexWrapper>
  );
}

function TemplateListPane() {
  return (
    // <div className="flex w-full overflow-hidden">
    <Resizable
      defaultSize={{
        width: "40%",
        height: "100%",
      }}
      maxWidth="50%"
      minWidth="200"
    >
      List
    </Resizable>
    // </div>
  );
}

function TemplateDetailPane() {
  return <div className="w-full min-w-[1px]">Details</div>;
}
