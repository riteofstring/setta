import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  LensClientError,
  type applyLensMutation,
  type subscribeLensSnapshots,
} from "../api/client";
import type { LensSnapshot } from "../api/generatedContract";
import { lensTestSnapshot } from "../test/lensTestData";
import { ExperimentLensController } from "./ExperimentLensController";
import type { ExperimentLensView } from "./ExperimentLensView";
import { useLens, type LensContextValue } from "./lensContext";

const boundary = vi.hoisted(() => ({
  fetch: vi.fn<() => Promise<LensSnapshot>>(),
  apply: vi.fn<typeof applyLensMutation>(),
  subscription: null as Parameters<typeof subscribeLensSnapshots>[0] | null,
  lens: null as LensContextValue | null,
  view: null as ComponentProps<typeof ExperimentLensView> | null,
}));

vi.mock("@riteofstring/setta", () => ({
  commitWorkspaceDocument: vi.fn(),
  createWorkspaceHost: () => ({
    dispose: vi.fn(),
    getSnapshot: () => ({ sections: {}, savedViews: null }),
  }),
  isWorkspaceSavedViewSectionVisible: () => true,
  setWorkspaceCapabilities: vi.fn(),
  setWorkspaceColorMode: vi.fn(),
  setWorkspaceMiniMapVisibility: vi.fn(),
  setWorkspaceSectionAttention: vi.fn(),
}));
vi.mock("./lensProjection", () => ({
  projectLensDocument: vi.fn(),
  presentationSectionIds: () => [],
}));
vi.mock("./lensSectionKinds", () => ({ registerLensSectionKinds: vi.fn() }));
vi.mock("./ExperimentLensView", () => ({
  ExperimentLensView: (props: ComponentProps<typeof ExperimentLensView>) => {
    boundary.lens = useLens();
    boundary.view = props;
    return null;
  },
}));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  fetchLensSnapshot: boundary.fetch,
  applyLensMutation: boundary.apply,
  subscribeLensSnapshots: (
    subscription: Parameters<typeof subscribeLensSnapshots>[0],
  ) => {
    boundary.subscription = subscription;
    return () => {};
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  boundary.lens = null;
  boundary.view = null;
  boundary.subscription = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function open(snapshot = lensTestSnapshot()) {
  boundary.fetch.mockResolvedValue(snapshot);
  await act(async () => root.render(<ExperimentLensController />));
  return snapshot;
}

function lens() {
  if (!boundary.lens) throw new Error("Lens did not load");
  return boundary.lens;
}

async function toggle(...ids: string[]) {
  await act(async () => {
    ids.forEach((id) => lens().actions.toggleObservation(id));
    await vi.advanceTimersByTimeAsync(0);
  });
}

it("keeps queued edits as a recoverable draft after a conflict without overwriting another window", async () => {
  const initial = await open();
  const remote = {
    ...initial,
    revision: initial.revision + 1,
    selection: {
      ...initial.selection,
      selectedObservationIds: ["observation-c"],
    },
  };
  boundary.fetch.mockResolvedValue(remote);
  let rejectSave: (reason: unknown) => void = () => {};
  boundary.apply.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
  );
  await toggle("observation-a", "observation-b");
  const draft = lens().selection;
  await act(async () =>
    rejectSave(new LensClientError("http", "Revision conflict", 409)),
  );
  expect(boundary.apply).toHaveBeenCalledTimes(1);
  expect(lens().snapshot.selection).toEqual(remote.selection);
  expect(lens().selection).toEqual(draft);
  expect(boundary.view?.recovery?.message).toContain("another window");
  await act(async () => boundary.subscription?.onSnapshot(remote));
  expect(boundary.view?.recovery).not.toBeNull();
  await toggle("observation-c");
  expect(boundary.apply).toHaveBeenCalledTimes(1);
  await act(async () => boundary.view?.recovery?.useSavedSelection());
  expect(lens().selection).toEqual(remote.selection);
  expect(boundary.view?.recovery).toBeNull();
});

it("does not use an intervening stream revision to authorize a queued replacement", async () => {
  const initial = await open();
  let resolveSave: (
    value: Awaited<ReturnType<typeof applyLensMutation>>,
  ) => void = () => {};
  boundary.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
  );
  await toggle("observation-a");
  const accepted = {
    ...initial,
    revision: initial.revision + 1,
    selection: lens().selection,
  };
  await act(async () =>
    boundary.subscription?.onSnapshot({
      ...accepted,
      revision: initial.revision + 2,
    }),
  );
  await toggle("observation-b");
  boundary.apply.mockResolvedValueOnce({
    version: 1,
    snapshot: {
      ...accepted,
      revision: initial.revision + 2,
      selection: lens().selection,
    },
  });
  await act(async () => resolveSave({ version: 1, snapshot: accepted }));
  expect(
    boundary.apply.mock.calls.map(([mutation]) => mutation.expectedRevision),
  ).toEqual([initial.revision, initial.revision + 1]);
});

it("retains uncertain writes and saves again only after an explicit draft action", async () => {
  const initial = await open();
  boundary.apply.mockRejectedValueOnce(new Error("Connection lost"));
  await toggle("observation-b");
  const draft = lens().selection;
  expect(boundary.view?.recovery?.message).toContain("could not be confirmed");
  const close = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(close);
  expect(close.defaultPrevented).toBe(true);
  boundary.apply.mockResolvedValueOnce({
    version: 1,
    snapshot: { ...initial, revision: initial.revision + 1, selection: draft },
  });
  await act(async () => boundary.view?.recovery?.saveDraft());
  expect(boundary.apply).toHaveBeenCalledTimes(2);
  expect(lens().selection).toEqual(draft);
  expect(boundary.view?.recovery).toBeNull();
  const savedClose = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(savedClose);
  expect(savedClose.defaultPrevented).toBe(false);
});

it("can recover from an initial connection failure", async () => {
  boundary.fetch.mockRejectedValueOnce(new Error("Offline"));
  await open();
  expect(container.textContent).toContain("Offline");
  await act(async () => container.querySelector("button")?.click());
  expect(boundary.lens).not.toBeNull();
});
