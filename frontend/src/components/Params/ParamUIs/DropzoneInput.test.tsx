import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { serializeDropzoneValue } from "utils/dropzone";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DropzoneInput } from "./DropzoneInput";

describe("DropzoneInput attachment display", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isShareMode: false });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("formats attachment size using shared formatBytes", () => {
    const value = serializeDropzoneValue([
      {
        kind: "file",
        id: "artifacts/test.txt",
        name: "test.txt",
        mimeType: "text/plain",
        size: 1024,
      },
    ]);

    const markup = renderToStaticMarkup(
      <DropzoneInput value={value} onChange={() => undefined} />,
    );

    expect(markup).toContain("1 KB");
  });
});
