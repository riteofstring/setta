#!/bin/sh
(cd ../abcde-utils && git fetch --all && git checkout noCodeInfoSerious && yarn && yarn link) || exit 1
(cd ../abcde-test && git fetch --all && git checkout noCodeInfoSerious && yarn && yarn link) || exit 1
(cd ../abcde-backend && git fetch --all && git checkout noCodeInfoSerious && yarn) || exit 1
(cd ../abcde-cli && git fetch --all && git checkout noCodeInfo && ./init_env.sh) || exit 1
(cd ../abcde-frontend && yarn link abcde-utils && yarn link abcde-test) || exit 1
(cd ../abcde-backend && yarn link abcde-utils && yarn link abcde-test) || exit 1
cd ../abcde-test && yarn link abcde-utils