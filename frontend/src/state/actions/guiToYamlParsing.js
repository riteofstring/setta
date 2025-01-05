export function parseRawDump(rawStr) {
  const lines = rawStr.split(/\r?\n/);
  return parseBlock(lines, 0, 0).result;
}

// Recursively parse a block of lines at or above the given indent.
// Returns { result, nextIndex }, where 'result' is the parsed structure
// (object or array) and 'nextIndex' is the line index where we stopped.
function parseBlock(lines, startIndex, currentIndent) {
  let i = startIndex;
  let result;
  // We won't know if it's an object or list until we see the first item
  let isList = false;
  let isObj = false;

  // Gather items until indentation is less than 'currentIndent'
  while (i < lines.length) {
    const line = lines[i];
    // If line is empty or only whitespace, skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Count leading spaces
    const indent = leadingSpaces(line);
    // If we've come back to a lesser indentation, block is done
    if (indent < currentIndent) break;

    // We are at or deeper than 'currentIndent'
    const trimmed = line.trim();

    // Detect if line is a list item
    const dashIdx = trimmed.indexOf("- ");
    if (dashIdx === 0) {
      // It's a list item. If we haven't chosen data-structure type yet, pick 'array'
      if (!isList && !isObj) {
        isList = true;
        result = [];
      } else if (isObj) {
        throw new Error("Mixed list and object at same level.");
      }

      // Extract what's after the dash
      // e.g. '- somevalue'
      const afterDash = trimmed.slice(2).trim();
      // If afterDash is something like "key:" or "key: |" or nothing, it might be a nested structure
      if (!afterDash || afterDash.endsWith(":") || afterDash.endsWith(": |")) {
        // This item is itself an object or sub-block. We'll parse it recursively.
        // But first, let's see if it looks like "someKey: (stuff)" on the same line.
        const { parsedValue, isBlock, extraIndent } =
          parsePossibleKeyValue(afterDash);
        if (isBlock) {
          // We have a block structure
          // We'll parse the next lines as that block
          const subBlock = parseBlock(
            lines,
            i + 1,
            currentIndent + extraIndent,
          );
          result.push(
            parsedValue === undefined
              ? subBlock.result
              : { [parsedValue]: subBlock.result },
          );
          i = subBlock.nextIndex;
        } else {
          // "afterDash" might be blank, meaning just `-`
          // Then we read a sub-block at the next indent
          const subBlock = parseBlock(lines, i + 1, indent + 2);
          result.push(subBlock.result);
          i = subBlock.nextIndex;
        }
      } else {
        // It's a plain single-line item. We'll treat it as a string.
        result.push(afterDash);
        i++;
      }
    } else {
      // We have something that should be a key: value
      // If we haven't chosen data-structure type yet, pick 'object'
      if (!isObj && !isList) {
        isObj = true;
        result = {};
      } else if (isList) {
        throw new Error("Mixed list and object at same level.");
      }

      // It's an object entry
      // Example: "key: something" or "key: |" (multi-line)
      const keyMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (!keyMatch) {
        throw new Error(`Line doesn't match "key: value" format: ${trimmed}`);
      }

      const key = keyMatch[1].trim();
      let remainder = keyMatch[2]; // might be "", "value", or "|"

      if (remainder === "|") {
        // Multi-line block
        const { textBlock, nextIdx } = gatherBlock(lines, i + 1, indent + 2);
        result[key] = textBlock;
        i = nextIdx;
      } else if (remainder === "") {
        // Means the line ended right after "key:"
        // So the value is presumably a nested block (dict or list)
        const subBlock = parseBlock(lines, i + 1, indent + 2);
        result[key] = subBlock.result;
        i = subBlock.nextIndex;
      } else {
        // Single line value
        // e.g. remainder = "something" or "5" or "True"
        result[key] = remainder;
        i++;
      }
    }
  }

  // If we never found any lines, default to empty object
  if (result === undefined) {
    result = {};
  }
  return { result: result, nextIndex: i };
}

// Extracts "key" if string looks like "myKey:" or "myKey: |", etc.
function parsePossibleKeyValue(str) {
  // Return {parsedValue, isBlock, extraIndent}
  // isBlock means we should parse a sub-block
  // extraIndent for nested blocks is 2 (matching your raw_dump behavior)
  const match = str.match(/^([^:]+):\s*(.*)$/);
  if (!match) {
    // No ":", so no key
    return { parsedValue: undefined, isBlock: false, extraIndent: 2 };
  }
  const key = match[1].trim();
  const after = match[2].trim();
  if (!after || after === "|") {
    // It's a block
    return { parsedValue: key, isBlock: true, extraIndent: 2 };
  }
  // It's "key: value" on the same line, not a block
  return { parsedValue: undefined, isBlock: false, extraIndent: 2 };
}

// Reads subsequent lines (indented > blockIndent) as literal text.
// Return all those lines (minus the indentation).
function gatherBlock(lines, startIndex, blockIndent) {
  let textBlock = "";
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // blank line, but might still be part of block
      // check indentation
      if (leadingSpaces(line) < blockIndent) {
        break;
      } else {
        textBlock += removeIndent(line, blockIndent) + "\n";
        i++;
        continue;
      }
    }
    const indent = leadingSpaces(line);
    if (indent < blockIndent) {
      break;
    }
    textBlock += removeIndent(line, blockIndent) + "\n";
    i++;
  }
  // Trim trailing newline
  if (textBlock.endsWith("\n")) {
    textBlock = textBlock.slice(0, -1);
  }
  return { textBlock, nextIdx: i };
}

// Count how many leading spaces a string has
function leadingSpaces(str) {
  let count = 0;
  for (let c of str) {
    if (c === " ") count++;
    else break;
  }
  return count;
}

// Remove up to n leading spaces from a line
function removeIndent(str, n) {
  let count = 0,
    out = "";
  for (let c of str) {
    if (count < n && c === " ") {
      count++;
    } else {
      out += c;
    }
  }
  return out;
}
