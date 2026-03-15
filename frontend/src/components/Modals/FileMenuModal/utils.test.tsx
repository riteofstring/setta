import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const useAllProjectMetadataMock = vi.fn(() => []);

vi.mock("state/stores/sessionStores", () => ({
  useAllProjectMetadata: (...args: unknown[]) =>
    useAllProjectMetadataMock(...args),
}));

vi.mock("state/actions/project/loadProject", () => ({
  loadAllProjectMetadata: vi.fn(),
}));

import { useProjectMetadataForFileMenu } from "./utils";

function HookHarness({ open }: { open: boolean }) {
  const metadata = useProjectMetadataForFileMenu(open);
  return <div>{metadata.length}</div>;
}

describe("useProjectMetadataForFileMenu", () => {
  it("subscribes to project metadata without a deep-equality comparator", () => {
    useAllProjectMetadataMock.mockReset();
    useAllProjectMetadataMock.mockReturnValue([]);

    renderToStaticMarkup(<HookHarness open={false} />);

    expect(useAllProjectMetadataMock).toHaveBeenCalledTimes(1);
    expect(useAllProjectMetadataMock.mock.calls[0]).toHaveLength(1);
    expect(typeof useAllProjectMetadataMock.mock.calls[0]?.[0]).toBe(
      "function",
    );
  });
});
