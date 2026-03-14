import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import { route_binary_upload } from "utils/generatedEndpoints";
import type { BinaryContentRef } from "utils/generatedTypes";

type UploadBinaryPayloadResult =
  | {
      status: "ok";
      contentId: string;
    }
  | {
      status: "failed";
      error: string;
    };
type BinaryUploadRouteResponse = ResponseDataAndStatus<BinaryContentRef>;

export async function uploadBinaryPayload({
  bytes,
  fileName,
  mimeType,
  durable = false,
}: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string | null;
  durable?: boolean;
}): Promise<UploadBinaryPayloadResult> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], {
      type: mimeType ?? "application/octet-stream",
    }),
    fileName,
  );
  form.append("durable", durable ? "true" : "false");
  const response: BinaryUploadRouteResponse = await route_binary_upload(form);
  if (!res200(response)) {
    return {
      status: "failed",
      error:
        getErrorDetail(response.data) ?? "Failed to upload binary payload.",
    };
  }
  return {
    status: "ok",
    contentId: response.data.contentId,
  };
}
