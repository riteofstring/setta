call node node_modules/dotenv-cli/cli.js -e .env.test -- db/blankSlate.bat
call node --experimental-vm-modules node_modules/dotenv-cli/cli.js -e .env.test node_modules/jest/bin/jest.js
call node node_modules/dotenv-cli/cli.js -e .env.test -- db/reset.bat --skip-seed