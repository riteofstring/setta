import { useLoadShareDeployment } from "state/hooks/share";
import { MainContainerCore } from "../MainContainerCore";

export function ShareMainContainer() {
  const [doneLoading, is404] = useLoadShareDeployment();
  return <MainContainerCore doneLoading={doneLoading} is404={is404} />;
}
