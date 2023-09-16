export function parseAllErrors(msg) {
  const pattern =
    /^(?<location>(?<file>[^\n]+?):(?<line>\d+):(?<column>\d+):(?<endLine>\d+):(?<endColumn>\d+)): (?<type>\w+): (?<message>.*?)(?:  \[(?<code>[\w-]+)\])?$/;
  const result = msg.split(/\r?\n/);

  const output = [];
  for (const r of result) {
    console.log(r);
    const match = r.match(pattern);
    if (match) {
      const allGroups = match.groups;
      output.push(allGroups);
    }
  }

  return output.map((x) => parseIndividualError(x));
}

function parseIndividualError(info) {
  if (info.code === 'arg-type') {
    return info;
  }
  if (info.code === 'call-arg') {
    info.missing = parseCallArgError(info.message);
    return info;
  }
}

function parseCallArgError(msg) {
  let xVars = msg.match(/Missing positional argument[s]? "(.+?)" in/);
  //   let yVar = msg.match(/in call to "(.+?)"/);

  if (xVars) {
    xVars = xVars[1].split('", "');
  }

  //   if (yVar) {
  //     yVar = yVar[1];
  //   }

  return xVars;
}
