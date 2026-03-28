import type { ComponentType } from "react";
import { useLoadProjectConfig } from "state/hooks/project";
import { MainContainerCore } from "../MainContainerCore";

type MainContainerProps = {
  SectionBoundary: ComponentType<{ sectionId: string }>;
};

export function MainContainer({ SectionBoundary }: MainContainerProps) {
  const [doneLoading, is404] = useLoadProjectConfig();
  return (
    <MainContainerCore
      doneLoading={doneLoading}
      is404={is404}
      SectionBoundary={SectionBoundary}
    />
  );
}
