import type { ComponentType } from "react";
import { MainContainerCore } from "../MainContainerCore";

type ShareMainContainerProps = {
  doneLoading: boolean;
  is404: boolean;
  SectionBoundary: ComponentType<{ sectionId: string }>;
};

export function ShareMainContainer({
  doneLoading,
  is404,
  SectionBoundary,
}: ShareMainContainerProps) {
  return (
    <MainContainerCore
      doneLoading={doneLoading}
      is404={is404}
      SectionBoundary={SectionBoundary}
    />
  );
}
