export function parseRawDump(rawStr) {
  const lines = rawStr.split(/\r?\n/);
  return parseBlock(lines, 0, 0).result;
}

function parseBlock(lines, startIndex, currentIndent) {
  let i = startIndex;
  let result;
  let isList = false;
  let isObj = false;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const indent = leadingSpaces(line);
    if (indent < currentIndent) break;
    const trimmed = line.trim();

    // List item?
    const dashIdx = trimmed.indexOf("- ");
    if (dashIdx === 0) {
      if (!isList && !isObj) {
        isList = true;
        result = [];
      } else if (isObj) {
        throw new Error("Mixed list and object at same level.");
      }
      const afterDash = trimmed.slice(2).trim();
      if (!afterDash || afterDash.endsWith(":") || afterDash.endsWith(": |")) {
        const { parsedValue, isBlock, extraIndent } =
          parsePossibleKeyValue(afterDash);
        if (isBlock) {
          const subBlock = parseBlock(
            lines,
            i + 1,
            currentIndent + extraIndent,
          );
          if (parsedValue === undefined) {
            result.push(subBlock.result);
          } else {
            result.push({ [parsedValue]: subBlock.result });
          }
          i = subBlock.nextIndex;
        } else {
          const subBlock = parseBlock(lines, i + 1, indent + 2);
          result.push(subBlock.result);
          i = subBlock.nextIndex;
        }
      } else {
        result.push(afterDash);
        i++;
      }
    } else {
      if (!isObj && !isList) {
        isObj = true;
        result = {};
      } else if (isList) {
        throw new Error("Mixed list and object at same level.");
      }
      const keyMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (!keyMatch) {
        throw new Error(`Line doesn't match "key: value": ${trimmed}`);
      }
      const key = keyMatch[1].trim();
      let remainder = keyMatch[2];

      if (remainder === "|") {
        const { textBlock, nextIdx } = gatherBlock(lines, i + 1, indent + 2);
        result[key] = textBlock;
        i = nextIdx;
      } else if (remainder === "") {
        // If there's nothing after "key:", it might be a nested block or empty value.
        const subBlock = parseBlock(lines, i + 1, indent + 2);
        // If subBlock returned an empty object or empty array, treat as ""
        if (
          (Array.isArray(subBlock.result) && subBlock.result.length === 0) ||
          (!Array.isArray(subBlock.result) &&
            Object.keys(subBlock.result).length === 0)
        ) {
          result[key] = "";
        } else {
          result[key] = subBlock.result;
        }
        i = subBlock.nextIndex;
      } else {
        // Single line value
        result[key] = remainder;
        i++;
      }
    }
  }
  if (result === undefined) result = {};
  return { result, nextIndex: i };
}

function parsePossibleKeyValue(str) {
  const match = str.match(/^([^:]+):\s*(.*)$/);
  if (!match) return { parsedValue: undefined, isBlock: false, extraIndent: 2 };
  const key = match[1].trim();
  const after = match[2].trim();
  if (!after || after === "|") {
    return { parsedValue: key, isBlock: true, extraIndent: 2 };
  }
  return { parsedValue: undefined, isBlock: false, extraIndent: 2 };
}

function gatherBlock(lines, startIndex, blockIndent) {
  let textBlock = "";
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      if (leadingSpaces(line) < blockIndent) break;
      textBlock += removeIndent(line, blockIndent) + "\n";
      i++;
      continue;
    }
    const indent = leadingSpaces(line);
    if (indent < blockIndent) break;
    textBlock += removeIndent(line, blockIndent) + "\n";
    i++;
  }
  if (textBlock.endsWith("\n")) {
    textBlock = textBlock.slice(0, -1);
  }
  return { textBlock, nextIdx: i };
}

function leadingSpaces(str) {
  let count = 0;
  for (let c of str) {
    if (c === " ") count++;
    else break;
  }
  return count;
}

function removeIndent(str, n) {
  let count = 0;
  let out = "";
  for (let c of str) {
    if (count < n && c === " ") count++;
    else out += c;
  }
  return out;
}
