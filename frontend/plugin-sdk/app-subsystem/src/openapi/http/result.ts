import type { ResponseDataAndStatus } from "../../requestTransport";

type OpenAPIFieldsResult<TData, TError = unknown> =
  | {
      data: TData;
      error?: undefined;
      response: Response;
    }
  | {
      data?: undefined;
      error: TError;
      response: Response;
    };

type OpenAPISuccessData<TResult> =
  TResult extends OpenAPIFieldsResult<infer TData, unknown>
    ? Exclude<TData, undefined>
    : never;

export async function callOpenAPI<TResult extends OpenAPIFieldsResult<unknown>>(
  promise: Promise<TResult>,
): Promise<ResponseDataAndStatus<OpenAPISuccessData<TResult>>> {
  try {
    const result = await promise;
    return {
      data: (result.data ??
        (result.error as OpenAPISuccessData<TResult> | undefined)) as
        | OpenAPISuccessData<TResult>
        | undefined,
      status: result.response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("OpenAPI request error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}
