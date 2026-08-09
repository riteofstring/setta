import { gunzipSync } from "node:zlib";

const blockSize = 512;

function readString(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  const resolvedEnd = end === -1 || end > start + length ? start + length : end;
  return buffer.toString("utf8", start, resolvedEnd);
}

function readOctal(buffer, start, length) {
  const rawValue = readString(buffer, start, length).trim();
  return rawValue === "" ? 0 : Number.parseInt(rawValue, 8);
}

export function readTarGzip(buffer) {
  const tarBuffer = gunzipSync(buffer);
  const entries = [];
  let offset = 0;

  while (offset + blockSize <= tarBuffer.length) {
    const name = readString(tarBuffer, offset, 100);
    if (name === "") {
      break;
    }

    const prefix = readString(tarBuffer, offset + 345, 155);
    const entryName = prefix === "" ? name : `${prefix}/${name}`;
    const size = readOctal(tarBuffer, offset + 124, 12);
    const contentStart = offset + blockSize;
    entries.push({
      name: entryName,
      content: tarBuffer.subarray(contentStart, contentStart + size),
    });
    offset = contentStart + Math.ceil(size / blockSize) * blockSize;
  }

  return entries;
}
