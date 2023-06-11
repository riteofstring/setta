usedotenv="node_modules/dotenv-cli/cli.js -e .env.test"
node $usedotenv ./db/blankSlate.sh
node --experimental-vm-modules $usedotenv -- node_modules/vitest/vitest.mjs --no-threads test/bigTests test/unitTests