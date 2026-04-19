import {
  ActionProvider,
  DataProvider,
  Renderer,
  VisibilityProvider,
} from "@json-render/react";
import type { CSSProperties } from "react";
import type { Policy } from "utils/generatedTypes";
import type { AppDefinition } from "../../appSubsystemContracts";
import { AppActionContext, AppRuntimeContext } from "./appContext";
import "./appMotion.css";
import { appRegistry } from "./appRegistry";
import { useAppRendererModel } from "./appRendererModel";
import { AppBreakpointProvider } from "./appResponsive";

type AppRendererProps = {
  appSpec: unknown | null;
  appDefinition: AppDefinition | null | undefined;
  appPolicy?: Policy | null;
  defaultConfigId?: string | null;
  rootKeyOverride?: string | null;
};

export function AppRenderer({
  appSpec,
  appDefinition,
  appPolicy,
  defaultConfigId,
  rootKeyOverride,
}: AppRendererProps) {
  const model = useAppRendererModel({
    appSpec,
    appDefinition,
    appPolicy,
    defaultConfigId,
    rootKeyOverride,
  });
  if (!model.spec || !model.spec.elements[model.spec.root]) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-6 py-10 text-center text-[color:var(--app-muted)] [font-size:var(--app-text-sm)]">
        No app spec found. Generate or save an app spec to preview.
      </div>
    );
  }
  return (
    <AppRuntimeContext.Provider
      value={{
        dataBindings: model.dataBindings,
        actions: model.actionDefinitions,
        policy: model.resolvedPolicy,
        canEditParams: model.canEditParams,
        allowExternalLinks: model.allowExternalLinks,
        allowFileDownloads: model.allowFileDownloads,
        defaultConfigId: model.fallbackConfigId,
        theme: model.resolvedTheme,
      }}
    >
      <AppActionContext.Provider
        value={{
          canRun: model.canRun,
          canReset: true,
          isRunning: model.isRunning,
          runDisabledReason: model.runDisabledReason,
        }}
      >
        <DataProvider initialData={model.dataBindings}>
          <VisibilityProvider>
            <ActionProvider handlers={model.actionHandlers}>
              <div
                className={model.resolvedTheme.className ?? ""}
                style={model.resolvedTheme.style as CSSProperties}
              >
                <AppBreakpointProvider>
                  <Renderer spec={model.spec} registry={appRegistry} />
                </AppBreakpointProvider>
              </div>
            </ActionProvider>
          </VisibilityProvider>
        </DataProvider>
      </AppActionContext.Provider>
    </AppRuntimeContext.Provider>
  );
}
