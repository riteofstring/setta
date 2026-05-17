export type BinaryPayload = ArrayBuffer | Blob | File | Uint8Array | string;

export async function binaryPayloadToArrayBuffer(
  payload: BinaryPayload,
): Promise<ArrayBuffer> {
  if (payload instanceof Blob) {
    return await payload.arrayBuffer();
  }
  if (payload instanceof ArrayBuffer) {
    return payload;
  }
  if (payload instanceof Uint8Array) {
    return payload.buffer.slice(
      payload.byteOffset,
      payload.byteOffset + payload.byteLength,
    ) as ArrayBuffer;
  }
  if (typeof payload === "string") {
    const encoded = new TextEncoder().encode(payload);
    return encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
  }
  throw new Error("Unsupported binary payload response.");
}

export async function binaryPayloadToUint8Array(
  payload: BinaryPayload,
): Promise<Uint8Array> {
  return new Uint8Array(await binaryPayloadToArrayBuffer(payload));
}

export function binaryPayloadToBlob(
  payload: BinaryPayload,
  options?: BlobPropertyBag,
): Blob {
  if (payload instanceof Blob) {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return new Blob([payload], options);
  }
  if (payload instanceof Uint8Array) {
    return new Blob([payload], options);
  }
  if (typeof payload === "string") {
    return new Blob([payload], options);
  }
  throw new Error("Unsupported binary payload response.");
}
