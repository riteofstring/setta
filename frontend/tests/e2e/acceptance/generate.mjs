import { verifyOrWrite } from "./verify.mjs";

verifyOrWrite({ write: true, quiet: false }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
