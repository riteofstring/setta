usedotenv="node_modules/dotenv-cli/cli.js -e .env.test"
if [[ "$2" == "--reset" ]]
then
    $usedotenv -- ./db/resetAndMigrate.sh
fi
node --experimental-vm-modules $usedotenv -- node_modules/vitest/vitest.mjs --no-threads test/unitTests/"$1"