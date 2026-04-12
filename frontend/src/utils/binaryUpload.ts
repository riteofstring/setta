import { uploadBinary } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { getErrorDetail, res200 } from "utils/endpointUtils";
type UploadBinaryPayloadResult =
  | {
      status: "ok";
      contentId: string;
    }
  | {
      status: "failed";
      error: string;
    };
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
  const file = new Blob([bytes], {
    type: mimeType ?? "application/octet-stream",
  });
  const response = await callOpenAPI(
    uploadBinary({
      body: {
        durable,
        file: new File([file], fileName, { type: file.type }),
      },
    } as Parameters<typeof uploadBinary>[0]),
  );
  if (!res200(response) || !response.data) {
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
