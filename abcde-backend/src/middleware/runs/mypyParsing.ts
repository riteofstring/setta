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
    info.code = 'argType';
    return info;
  }
  if (info.code === 'call-arg') {
    const { xVars, errorType } = parseCallArgError(info.message);
    info.code = errorType;
    info.badVars = xVars;
    return info;
  }
  return info;
}

function parseCallArgError(msg) {
  let errorType = '';
  let xVars = [];
  //   let yVar = null;

  if (msg.includes('Missing positional argument')) {
    errorType = 'missingArgs';
    const xVarsMatch = msg.match(/Missing positional argument[s]? "(.+?)" in/);
    const yVarMatch = msg.match(/in call to "(.+?)"/);

    if (xVarsMatch) {
      xVars = xVarsMatch[1].split('", "');
    }
    // if (yVarMatch) {
    //   yVar = yVarMatch[1];
    // }
  } else if (msg.includes('Unexpected keyword argument')) {
    errorType = 'unexpectedKeywordArg';
    const xVarMatch = msg.match(/Unexpected keyword argument "(.+?)"/);
    const yVarMatch = msg.match(/for "(.+?)"/);

    if (xVarMatch) {
      xVars = [xVarMatch[1]];
    }
    // if (yVarMatch) {
    //   yVar = yVarMatch[1];
    // }
  }
  return { xVars, errorType };
}
