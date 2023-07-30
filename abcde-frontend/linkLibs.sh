#!/bin/sh
cd ../abcde-utils && git pull && git checkout $1 && git pull && yarn && yarn link && cd ../abcde-frontend && yarn link abcde-utils
cd ../abcde-test && git pull && git checkout $1 && git pull && yarn && yarn link && cd ../abcde-frontend && yarn link abcde-test