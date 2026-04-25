import { LoadingSpinner } from "components/Pages/LoadingSpinner";
import { NotFound } from "components/Pages/NotFound/NotFound";
import { AppPage } from "./AppPage";

type AppMainContainerProps = {
  doneLoading: boolean;
  is404: boolean;
};

export function AppMainContainer({
  doneLoading,
  is404,
}: AppMainContainerProps) {
  if (!doneLoading) {
    return <LoadingSpinner />;
  }

  if (is404) {
    return <NotFound />;
  }

  return <AppPage />;
}
