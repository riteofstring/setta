set usedotenv=node_modules/dotenv-cli/cli.js -e .env.test
call node %usedotenv% db/blankSlate.bat
call node --experimental-vm-modules %usedotenv% -- node_modules/vitest/vitest.mjs test/bigTests