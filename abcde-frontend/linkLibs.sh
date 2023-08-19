#!/bin/sh
cd ../abcde-utils && git pull origin main && yarn && yarn link
cd ../abcde-test && git pull origin main && yarn && yarn link
cd ../abcde-backend && git pull origin main && yarn
cd ../abcde-cli && git pull origin noCodeInfo && ./init_env.sh
cd ../abcde-frontend && yarn link abcde-utils && yarn link abcde-test
cd ../abcde-backend && yarn link abcde-utils && yarn link abcde-test
cd ../abcde-test && yarn link abcde-utils