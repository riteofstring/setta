#!/bin/sh
(cd ../abcde-utils && git pull origin main && yarn && yarn link) || exit 1
(cd ../abcde-test && git pull origin main && yarn && yarn link) || exit 1
(cd ../abcde-backend && git pull origin noCodeInfo && yarn) || exit 1
(cd ../abcde-cli && git pull origin noCodeInfo && ./init_env.sh) || exit 1
(cd ../abcde-frontend && yarn link abcde-utils && yarn link abcde-test) || exit 1
(cd ../abcde-backend && yarn link abcde-utils && yarn link abcde-test) || exit 1
cd ../abcde-test && yarn link abcde-utils