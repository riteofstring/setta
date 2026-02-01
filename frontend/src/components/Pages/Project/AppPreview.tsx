import { AppRenderer } from "components/App/AppRenderer";
import { useProjectState } from "state/definitions";

export function AppPreview() {
  const appSpec = useProjectState((x) => x.appSpec);
  const appConfig = useProjectState((x) => x.projectConfig.appConfig);

  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-setta-50/70 dark:bg-setta-950/60">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400 dark:text-setta-500">
            App Preview
          </div>
        </div>
        <AppRenderer appSpec={appSpec} appConfig={appConfig} />
      </div>
    </div>
  );
}
