const protocolVersion = Number(process.env.SETTA_TEST_PROTOCOL_VERSION);

if (!Number.isSafeInteger(protocolVersion) || protocolVersion <= 0) {
  throw new Error("SETTA_TEST_PROTOCOL_VERSION must be a positive integer");
}

export { protocolVersion };
