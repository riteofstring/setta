import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { C_ADDRESSES } from "./c_addresses";
import { get, getBinary, getErrorDetail, post } from "./endpointUtils";
import { RouteEnum } from "./generatedTypes";

describe("endpointUtils URL routing", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
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

  it("routes launcherStatus via launcher origin", async () => {
    await get(RouteEnum.GET_LAUNCHER_STATUS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.GET_LAUNCHER_STATUS}`,
    );
  });

  it("routes launcher repair/update/remove via launcher origin", async () => {
    await post(RouteEnum.REPAIR_LAUNCHER, {});
    await post(RouteEnum.UPDATE_LAUNCHER, { packageSpec: "setta" });
    await post(RouteEnum.REMOVE_LAUNCHER, {});

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.REPAIR_LAUNCHER}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.UPDATE_LAUNCHER}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.REMOVE_LAUNCHER}`,
    );
  });

  it("keeps streamAppSpec on backend origin", async () => {
    await post(RouteEnum.STREAM_APP_SPEC, { prompt: "Generate app" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.STREAM_APP_SPEC}`,
    );
  });

  it("parses binary responses as Uint8Array", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "text/csv" },
      }),
    );

    const result = await getBinary(RouteEnum.BINARY_DOWNLOAD, {
      contentId: "abc123",
    });

    expect(result.status).toBe(200);
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.data ?? [])).toEqual([1, 2, 3]);
  });

  it("parses non-2xx binary responses as JSON error payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Missing content id." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await getBinary(RouteEnum.BINARY_DOWNLOAD, {
      contentId: "missing",
    });

    expect(result.status).toBe(404);
    expect(getErrorDetail(result.data)).toBe("Missing content id.");
  });

  it("extracts detail from raw binary JSON payloads", () => {
    const binaryJson = new TextEncoder().encode(
      JSON.stringify({ detail: "Permission denied." }),
    );

    expect(getErrorDetail(binaryJson)).toBe("Permission denied.");
  });
});
