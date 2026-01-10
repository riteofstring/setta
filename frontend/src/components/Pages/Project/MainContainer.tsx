import { useLoadProjectConfig } from "state/hooks/project";
import { MainContainerCore } from "../MainContainerCore";

export function MainContainer() {
  const [doneLoading, is404] = useLoadProjectConfig();
  return <MainContainerCore doneLoading={doneLoading} is404={is404} />;
}
