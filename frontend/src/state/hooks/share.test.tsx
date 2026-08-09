/* @vitest-environment jsdom */

import type { GetShareDeploymentCurrentSessionResponses } from "openapi/http";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useProjectLoading, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createPolicy, createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureShareSessionMock = vi.fn();
const loadProjectStateMock = vi.fn();
const fetchListenerCoverageSnapshotMock = vi.fn();
const requestAIFollowSnapshotMock = vi.fn();

vi.mock("state/actions/share", () => ({
  ensureShareSessionFromCurrentDeployment: (options?: unknown) =>
    options === undefined
      ? ensureShareSessionMock()
      : ensureShareSessionMock(options),
}));

vi.mock("state/actions/project/loadProject", () => ({
  loadProjectState: (projectState: unknown) =>
    loadProjectStateMock(projectState),
}));

vi.mock("state/actions/listenerCoverage", () => ({
  fetchListenerCoverageSnapshot: (projectConfigId: string) =>
    fetchListenerCoverageSnapshotMock(projectConfigId),
}));

vi.mock("state/actions/aiFollow", () => ({
  requestAIFollowSnapshot: (projectConfigId: string) =>
    requestAIFollowSnapshotMock(projectConfigId),
}));

import { useLoadShareDeployment, useShareCapabilities } from "./share";

type ShareDeploymentSession = GetShareDeploymentCurrentSessionResponses[200];

function buildShareSession(
  overrides: Partial<ShareDeploymentSession> = {},
): ShareDeploymentSession {
  const projectConfig = createProjectConfig({
    id: "project-alpha",
    name: "Alpha",
  });
  return {
    deploymentName: "demo-share",
    deploymentVersion: "v1",
    shareSessionId: "share-session-a",
    sessionRunCount: 1,
    defaultProjectConfigId: projectConfig.id,
    projectMetadata: [projectConfig],
    sharePolicy: createPolicy(),
    manifest: null,
    ...overrides,
  };
}

function ShareCapabilitiesHarness() {
  const capabilities = useShareCapabilities();
  return (
    <div
      data-testid="share-capabilities"
      data-can-edit-layout={String(capabilities.canEditLayout)}
      data-can-edit-params={String(capabilities.canEditParams)}
      data-can-edit-structure={String(capabilities.canEditStructure)}
      data-can-edit-variants={String(capabilities.canEditVariants)}
      data-can-run={String(capabilities.canRun)}
    />
  );
}

function ShareLoadHarness({ loadProject = true }: { loadProject?: boolean }) {
  const [doneLoading, is404] = useLoadShareDeployment(loadProject);
  return (
    <div
      data-testid="share-load"
      data-done-loading={String(doneLoading)}
      data-is404={String(is404)}
    />
  );
}

type RenderedHarness = {
  host: HTMLDivElement;
  root: Root;
  flush: () => Promise<void>;
  getByTestId: (testId: string) => HTMLElement;
  unmount: () => Promise<void>;
};

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderHarness(
  node: React.ReactElement,
  route = "/",
  path = "/:projectConfigName?",
): Promise<RenderedHarness> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={node} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flushEffects();

  return {
    host,
    root,
    flush: flushEffects,
    getByTestId: (testId: string) => {
      const element = host.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      if (!element) {
        throw new Error(`Missing test element: ${testId}`);
      }
      return element;
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

describe("share hooks", () => {
  beforeEach(() => {
    resetProjectStores();
    ensureShareSessionMock.mockReset();
    loadProjectStateMock.mockReset();
    fetchListenerCoverageSnapshotMock.mockReset();
    requestAIFollowSnapshotMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("returns full edit capabilities outside deployment mode", async () => {
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: null,
    });

    const harness = await renderHarness(<ShareCapabilitiesHarness />);
    const element = harness.getByTestId("share-capabilities");

    expect(element.dataset.canEditParams).toBe("true");
    expect(element.dataset.canEditVariants).toBe("true");
    expect(element.dataset.canEditLayout).toBe("true");
    expect(element.dataset.canRun).toBe("true");
    expect(element.dataset.canEditStructure).toBe("true");

    await harness.unmount();
  });

  it("uses deployment defaults when no share policy is present", async () => {
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: null,
    });

    const harness = await renderHarness(<ShareCapabilitiesHarness />);
    const element = harness.getByTestId("share-capabilities");

    expect(element.dataset.canEditParams).toBe("true");
    expect(element.dataset.canEditVariants).toBe("true");
    expect(element.dataset.canEditLayout).toBe("true");
    expect(element.dataset.canRun).toBe("false");
    expect(element.dataset.canEditStructure).toBe("false");

    await harness.unmount();
  });

  it("respects deployment share policy overrides", async () => {
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: createPolicy({
        allowParamChanges: false,
        allowVariantChanges: false,
        allowLayoutChanges: false,
        allowRun: true,
      }),
    });

    const harness = await renderHarness(<ShareCapabilitiesHarness />);
    const element = harness.getByTestId("share-capabilities");

    expect(element.dataset.canEditParams).toBe("false");
    expect(element.dataset.canEditVariants).toBe("false");
    expect(element.dataset.canEditLayout).toBe("false");
    expect(element.dataset.canRun).toBe("true");
    expect(element.dataset.canEditStructure).toBe("false");

    await harness.unmount();
  });

  it("completes deployment session loading without fetching project data", async () => {
    ensureShareSessionMock.mockResolvedValue(buildShareSession());

    const harness = await renderHarness(
      <ShareLoadHarness loadProject={false} />,
      "/",
      "/",
    );
    await harness.flush();

    const element = harness.getByTestId("share-load");

    expect(element.dataset.doneLoading).toBe("true");
    expect(element.dataset.is404).toBe("false");
    expect(ensureShareSessionMock).toHaveBeenCalledTimes(1);
    expect(loadProjectStateMock).not.toHaveBeenCalled();
    expect(fetchListenerCoverageSnapshotMock).not.toHaveBeenCalled();
    expect(requestAIFollowSnapshotMock).not.toHaveBeenCalled();
    expect(useProjectLoading.getState()).toMatchObject({
      projectIsLoading: false,
      projectIs404: false,
    });

    await harness.unmount();
  });

  it("marks the deployment as missing when the requested project config is absent", async () => {
    ensureShareSessionMock.mockResolvedValue(buildShareSession());

    const harness = await renderHarness(
      <ShareLoadHarness />,
      "/missing-config",
      "/:projectConfigName",
    );
    await harness.flush();

    const element = harness.getByTestId("share-load");

    expect(element.dataset.doneLoading).toBe("true");
    expect(element.dataset.is404).toBe("true");
    expect(ensureShareSessionMock).toHaveBeenCalledTimes(1);
    expect(loadProjectStateMock).not.toHaveBeenCalled();
    expect(fetchListenerCoverageSnapshotMock).not.toHaveBeenCalled();
    expect(requestAIFollowSnapshotMock).not.toHaveBeenCalled();
    expect(useProjectLoading.getState()).toMatchObject({
      projectIsLoading: false,
      projectIs404: true,
    });

    await harness.unmount();
  });
});
