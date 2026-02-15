function normalizeTypeAnnotation(typeAnnotation: string): string {
  return typeAnnotation.replace(/\s+/g, "").toLowerCase();
}

function isStringLikeTypeName(typeName: string): boolean {
  return typeName === "str" || typeName === "builtins.str";
}

function isNoneTypeName(typeName: string): boolean {
  return (
    typeName === "none" || typeName === "nonetype" || typeName === "noneType"
  );
}

function splitUnionMembers(raw: string): string[] {
  if (raw.includes("|")) {
    return raw.split("|").filter((member) => member !== "");
  }
  const unionMatch = /^(typing\.)?union\[(.+)\]$/.exec(raw);
  if (!unionMatch) {
    return [];
  }
  return unionMatch[2].split(",").filter((member) => member !== "");
}

export function isStringTypeAnnotation(typeAnnotation: string): boolean {
  const normalized = normalizeTypeAnnotation(typeAnnotation);
  if (normalized === "") {
    return false;
  }
  if (isStringLikeTypeName(normalized)) {
    return true;
  }

  const optionalMatch = /^(typing\.)?optional\[(.+)\]$/.exec(normalized);
  if (optionalMatch) {
    return isStringTypeAnnotation(optionalMatch[2]);
  }

  const unionMembers = splitUnionMembers(normalized);
  if (unionMembers.length > 0) {
    const hasStringMember = unionMembers.some((member) =>
      isStringLikeTypeName(member),
    );
    if (!hasStringMember) {
      return false;
    }
    return unionMembers.every(
      (member) => isStringLikeTypeName(member) || isNoneTypeName(member),
    );
  }

  return false;
}
