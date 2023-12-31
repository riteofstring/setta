import { HeaderContainer } from "components/AppContainer/Header/Header";
import { FlexWrapper } from "utils/Wrappers/FlexWrapper";
import { TemplateDetailPane } from "./CommunityComponents/TemplateDetailsPane";
import { TemplateListPane } from "./CommunityComponents/TemplateListPane";

export function CommunityPage() {
  return (
    <FlexWrapper>
      <HeaderContainer />
      <div className="flex h-[calc(100vh_-_56px)] bg-white dark:bg-runcoder-900">
        <TemplateListPane />
        <TemplateDetailPane />
      </div>
    </FlexWrapper>
  );
}
