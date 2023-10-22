#!/bin/sh

(cd ../utils && yarn && yarn link) || exit 1
(cd ../test && yarn && yarn link) || exit 1
(cd ../backend && yarn) || exit 1
(cd ../cli && ./init_env.sh) || exit 1
(cd ../frontend && yarn link abcde-utils && yarn link abcde-test) || exit 1
(cd ../backend && yarn link abcde-utils && yarn link abcde-test) || exit 1