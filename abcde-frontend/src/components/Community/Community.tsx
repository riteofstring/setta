import { FlexWrapper } from "components/AppContainer/FlexWrapper/FlexWrapper";
import { HeaderContainer } from "components/AppContainer/Header/Header";
import { TemplateDetailPane } from "./CommunityComponents/TemplateDetailsPane";
import { TemplateListPane } from "./CommunityComponents/TemplateListPane";

export function CommunityPage() {
  return (
    <FlexWrapper>
      <HeaderContainer />
      <div className="flex h-[calc(100vh_-_56px)] bg-white">
        <TemplateListPane />
        <TemplateDetailPane />
      </div>
    </FlexWrapper>
  );
}
