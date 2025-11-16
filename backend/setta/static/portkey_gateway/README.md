# Portkey Gateway bundle

The self-hosted Portkey gateway CLI bundle lives in this directory so the
Python wheel ships a ready-to-run gateway without requiring an external
`pnpm dlx` download.

Drop the extracted `@portkey-ai/gateway` package contents here (the same files
that `npx @portkey-ai/gateway` would execute) before running `./build.sh`. The
bundle **must** include a `package.json` with a valid `bin` entry so Setta can
locate the entrypoint automatically.
