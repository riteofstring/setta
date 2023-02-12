import { FlexWrapper } from "components/AppContainer/FlexWrapper/FlexWrapper";
import { HeaderContainer } from "components/AppContainer/Header/Header";
import { Resizable } from "re-resizable";

export function CommunityPage() {
  return (
    <FlexWrapper>
      <HeaderContainer />
      <div className="flex h-[calc(100vh_-_56px)] ">
        <TemplateListPane />
        <TemplateDetailPane />
      </div>
    </FlexWrapper>
  );
}

function TemplateListPane() {
  return (
    <Resizable
      defaultSize={{
        width: "300px",
        height: "100%",
      }}
      maxWidth="50%"
      minWidth="350px"
      className="border-r-2 border-solid border-white bg-slate-50 py-8 px-11 shadow-lg"
      enable={{
        top: false,
        right: true,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
    >
      <ListContent />
    </Resizable>
  );
}

function TemplateDetailPane() {
  return (
    <div className="w-full min-w-[1px] py-8 px-11">
      <DetailsContent />
    </div>
  );
}

function ListContent() {
  return (
    <h2 className="pb-3 text-base font-bold  uppercase tracking-widest text-slate-400">
      Templates
    </h2>
  );
}

function DetailsContent() {
  return (
    <h2 className="pb-3 text-base font-bold  uppercase tracking-widest text-slate-400">
      Details
    </h2>
  );
}
