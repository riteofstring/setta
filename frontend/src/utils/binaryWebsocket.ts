const HEADER_LENGTH_BYTES = 4;

export function encodeBinaryFrame(
  header: Record<string, unknown>,
  payload: ArrayBuffer,
): ArrayBuffer {
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(JSON.stringify(header));
  const totalLength =
    HEADER_LENGTH_BYTES + headerBytes.length + payload.byteLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  view.setUint32(0, headerBytes.length, false);
  const bytes = new Uint8Array(buffer);
  bytes.set(headerBytes, HEADER_LENGTH_BYTES);
  bytes.set(new Uint8Array(payload), HEADER_LENGTH_BYTES + headerBytes.length);
  return buffer;
}
