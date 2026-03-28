import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import { MainContainerCore } from "../MainContainerCore";

type ShareMainContainerProps = {
  doneLoading: boolean;
  is404: boolean;
};

export function ShareMainContainer({
  doneLoading,
  is404,
}: ShareMainContainerProps) {
  return (
    <MainContainerCore
      doneLoading={doneLoading}
      is404={is404}
      SectionBoundary={SectionContainerBoundary}
    />
  );
}
