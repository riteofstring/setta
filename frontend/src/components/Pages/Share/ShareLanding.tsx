import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { res200 } from "utils/endpointUtils";
import { route_list_share_deployments } from "utils/generatedEndpoints";
import type { ShareDeploymentMetadata } from "utils/generatedTypes";

type ShareDeploymentListState = {
  deployments: Array<ShareDeploymentMetadata>;
  isLoading: boolean;
  errorMessage: string | null;
};

export function ShareLanding() {
  const [state, setState] = useState<ShareDeploymentListState>({
    deployments: [],
    isLoading: true,
    errorMessage: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDeployments() {
      const res = await route_list_share_deployments();
      if (!isMounted) {
        return;
      }
      if (!res200(res)) {
        setState({
          deployments: [],
          isLoading: false,
          errorMessage: "Unable to load share deployments.",
        });
        return;
      }
      setState({
        deployments: res.data,
        isLoading: false,
        errorMessage: null,
      });
    }

    void loadDeployments();
    return () => {
      isMounted = false;
    };
  }, []);

  const content = buildContent(state);

  return (
    <div className="app-shell flex min-h-screen min-w-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-3xl rounded-2xl border border-setta-200 bg-white/90 p-6 shadow-sm dark:border-setta-700 dark:bg-setta-900/80">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-setta-400 dark:text-setta-500">
          Sharing Mode
        </div>
        <h1 className="mt-2 text-xl font-semibold text-setta-700 dark:text-setta-100">
          Share backend is running
        </h1>
        <p className="mt-2 text-sm text-setta-500 dark:text-setta-300">
          Publish a deployment from IDE mode, then open its share URL.
        </p>
        <div className="mt-4">{content}</div>
      </div>
    </div>
  );
}

function buildContent(state: ShareDeploymentListState): JSX.Element {
  if (state.isLoading) {
    return <p className="text-sm text-setta-500">Loading deployments...</p>;
  }
  if (state.errorMessage) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        {state.errorMessage}
      </p>
    );
  }
  if (state.deployments.length === 0) {
    return (
      <p className="text-sm text-setta-500">
        No deployments found yet. Publish one to continue.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {state.deployments.map((deployment) => {
        const sharePath = buildSharePath(deployment.deploymentId);
        return (
          <div
            key={deployment.deploymentId}
            className="flex flex-col gap-2 rounded-lg border border-setta-200 bg-setta-50/70 px-3 py-2 dark:border-setta-700 dark:bg-setta-900/50"
          >
            <div className="text-xs font-semibold text-setta-500 dark:text-setta-300">
              {deployment.deploymentId}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Link
                className="rounded-full border border-setta-300 px-3 py-1 text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                to={sharePath}
              >
                Open share view
              </Link>
              <span className="text-setta-400">{sharePath}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildSharePath(deploymentId: string): string {
  return `/share/${deploymentId}`;
}
