import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureAppReady,
  postBackend,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

type FileBrowserRootResponse = {
  rootPath: string;
};

type FileBrowserFileContentResponse = {
  contentId: string;
  mtimeNs: number;
};

test("file browser content endpoint uses binary content ids for read/write", async ({
  page,
  request,
}) => {
  await ensureAppReady(page);
  const root = await postBackend<FileBrowserRootResponse>(
    page,
    "/getFileBrowserRoot",
    null,
  );
  const rootPath = root?.rootPath;
  if (!rootPath) {
    throw new Error("Missing file browser root path.");
  }

  const csvPath = path.join(rootPath, `pw-binary-flow-${Date.now()}.csv`);
  await fs.writeFile(csvPath, "task,status\nalpha,todo\n", "utf-8");

  // Validate read flow: route returns a content id and bytes are downloaded
  // from the binary endpoint without base64 decoding.
  const readResult = await postBackend<FileBrowserFileContentResponse>(
    page,
    "/getFileBrowserFileContent",
    { path: csvPath },
  );
  const readContentId = readResult?.contentId;
  if (!readContentId) {
    throw new Error("Missing file browser content id.");
  }
  const readBinaryResponse = await request.get(
    `${BACKEND_ORIGIN}/api/binary/${encodeURIComponent(readContentId)}`,
  );
  expect(readBinaryResponse.ok()).toBeTruthy();
  await expect(readBinaryResponse.text()).resolves.toContain("alpha,todo");

  const uploaded = await request.post(`${BACKEND_ORIGIN}/api/binary/upload`, {
    multipart: {
      file: {
        name: "updated.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("task,status\nalpha,done\n", "utf-8"),
      },
      durable: "false",
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  const uploadedPayload: unknown = await uploaded.json();
  if (
    !uploadedPayload ||
    typeof uploadedPayload !== "object" ||
    !("contentId" in uploadedPayload) ||
    typeof uploadedPayload.contentId !== "string"
  ) {
    throw new Error("Missing uploaded binary content id.");
  }

  const writeResult = await postBackend<{ mtimeNs: number }>(
    page,
    "/writeFileBrowserFileContent",
    {
      path: csvPath,
      contentId: uploadedPayload.contentId,
      expectedMtimeNs: null,
    },
  );
  expect(writeResult?.mtimeNs).toBeTruthy();
  await expect(fs.readFile(csvPath, "utf-8")).resolves.toContain("alpha,done");
});
