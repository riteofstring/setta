const { CODE_TOKEN, UI_SPECS } = require("./constants");

const getTypeAndRemovePrefix = (deeplinkingUrl) => {
  for (let key of [CODE_TOKEN, UI_SPECS]) {
    if (deeplinkingUrl.startsWith(key)) {
      return { parsedUrl: deeplinkingUrl.replace(key, ""), requestType: key };
    }
  }
};

const parseUrl = (deeplinkingUrl) => {
  deeplinkingUrl[0] = deeplinkingUrl[0].replace("abcde://", "").replace(/\/+$/, "");
  const {parsedUrl, requestType} = getTypeAndRemovePrefix(deeplinkingUrl[0]);
  deeplinkingUrl[0] = parsedUrl
  return {deeplinkingUrl, requestType}
};

exports.parseUrl = parseUrl;
