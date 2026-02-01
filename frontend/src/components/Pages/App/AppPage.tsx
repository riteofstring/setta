import { AppRenderer } from "components/App/AppRenderer";
import { useProjectState, useShareSession } from "state/definitions";

export function AppPage() {
  const projectConfig = useProjectState((x) => x.projectConfig);
  const appSpec = useProjectState((x) => x.appSpec);
  const appPolicy = useShareSession((x) => x.sharePolicy);
  const appConfig = projectConfig.appConfig;
  const appTitle =
    appConfig?.routes?.[0]?.name ?? appConfig?.catalogId ?? projectConfig.name;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-setta-200 bg-white/90 px-6 py-4 dark:border-setta-800 dark:bg-setta-950/80">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-setta-400 dark:text-setta-500">
            App Mode
          </span>
          <h1 className="text-lg font-semibold text-setta-800 dark:text-setta-100">
            {appTitle}
          </h1>
        </div>
        {appPolicy && (
          <div className="text-xs text-setta-500 dark:text-setta-400">
            {appPolicy.allowRun ? "Runs enabled" : "Runs disabled"}
          </div>
        )}
      </header>

      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_45%),linear-gradient(180deg,_rgba(248,250,252,0.9),_rgba(226,232,240,0.6))] px-4 py-8 dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_45%),linear-gradient(180deg,_rgba(15,23,42,0.9),_rgba(2,6,23,0.9))]">
        <div className="w-full max-w-5xl">
          <AppRenderer
            appSpec={appSpec}
            appConfig={appConfig}
            appPolicy={appPolicy}
          />
        </div>
      </main>
    </div>
  );
}
