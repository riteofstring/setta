#!/bin/sh
cd ../abcde-utils && git checkout $1 && git pull && yarn && yarn link && cd ../abcde-frontend && yarn link abcde-utils
cd ../abcde-test && git checkout $1 && git pull && yarn && yarn link && cd ../abcde-frontend && yarn link abcde-test