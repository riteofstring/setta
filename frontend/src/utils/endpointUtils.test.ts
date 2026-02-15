import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { C_ADDRESSES } from "./c_addresses";
import { get, post } from "./endpointUtils";
import { RouteEnum } from "./generatedTypes";

describe("endpointUtils URL routing", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("routes settaHomeInfo via launcher origin", async () => {
    await get(RouteEnum.GET_SETTA_HOME_INFO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.GET_SETTA_HOME_INFO}`,
    );
  });

  it("routes revealPathInOsFileExplorer via launcher origin", async () => {
    await post(RouteEnum.REVEAL_PATH_IN_OS_FILE_EXPLORER, {
      path: "/tmp/example",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.REVEAL_PATH_IN_OS_FILE_EXPLORER}`,
    );
  });

  it("keeps streamAppSpec on backend origin", async () => {
    await post(RouteEnum.STREAM_APP_SPEC, { prompt: "Generate app" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.STREAM_APP_SPEC}`,
    );
  });
});
