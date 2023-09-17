#!/bin/sh
gitFetchAndCheckout() {
    git fetch -u origin $1:$1 && git checkout $1
}


(cd ../abcde-utils && gitFetchAndCheckout noCodeInfoSerious && yarn && yarn link) || exit 1
(cd ../abcde-test && gitFetchAndCheckout noCodeInfoSerious && yarn && yarn link) || exit 1
(cd ../abcde-backend && gitFetchAndCheckout noCodeInfoSerious && yarn) || exit 1
(cd ../abcde-cli && gitFetchAndCheckout noCodeInfo && ./init_env.sh) || exit 1
(cd ../abcde-frontend && yarn link abcde-utils && yarn link abcde-test) || exit 1
(cd ../abcde-backend && yarn link abcde-utils && yarn link abcde-test) || exit 1