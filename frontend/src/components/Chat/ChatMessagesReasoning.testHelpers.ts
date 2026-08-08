export function getTagByMarker(markup: string, marker: string): string | null {
  const markerIndex = markup.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const tagStart = markup.lastIndexOf("<div", markerIndex);
  if (tagStart < 0) {
    return null;
  }
  const tagEnd = markup.indexOf(">", tagStart);
  if (tagEnd < 0) {
    return null;
  }
  return markup.slice(tagStart, tagEnd);
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

export function getDivHtmlByMarker(
  markup: string,
  marker: string,
): string | null {
  const markerIndex = markup.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const tagStart = markup.lastIndexOf("<div", markerIndex);
  if (tagStart < 0) {
    return null;
  }
  const divTagPattern = /<\/?div\b[^>]*>/g;
  divTagPattern.lastIndex = tagStart;
  let depth = 0;
  for (const match of markup.matchAll(divTagPattern)) {
    const matchStart = match.index;
    if (matchStart === undefined || matchStart < tagStart) {
      continue;
    }
    const tag = match[0];
    if (tag.startsWith("</div")) {
      depth -= 1;
      if (depth === 0) {
        return markup.slice(tagStart, matchStart + tag.length);
      }
      continue;
    }
    depth += 1;
  }
  return null;
}
