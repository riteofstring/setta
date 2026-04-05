import type { ResponseDataAndStatus } from "utils/requestTransport";

type OpenAPIFieldsResult<TData> = {
  data?: TData;
  error?: unknown;
  response: Response;
};

export async function callOpenAPI<TData>(
  promise: Promise<OpenAPIFieldsResult<TData>>,
): Promise<ResponseDataAndStatus<TData>> {
  try {
    const result = await promise;
    return {
      data: (result.data ?? (result.error as TData | undefined)) as
        | TData
        | undefined,
      status: result.response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("OpenAPI request error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}
