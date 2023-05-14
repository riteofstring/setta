set usedotenv=node_modules/dotenv-cli/cli.js -e .env.test
@REM call node %usedotenv% db/blankSlate.bat
call node --experimental-vm-modules %usedotenv% -- node_modules/vitest/vitest.mjs --no-threads test/bigTests