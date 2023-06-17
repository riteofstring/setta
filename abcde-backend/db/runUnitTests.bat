set usedotenv=node_modules/dotenv-cli/cli.js -e .env.test
if [%2]==[] goto actualtest
if "%~2" == "--reset" (
    call node %usedotenv% db/resetAndMigrate.bat
)
:actualtest
call node --experimental-vm-modules %usedotenv% -- node_modules/vitest/vitest.mjs --no-threads test/unitTests/%1