#!/bin/sh
cd ../abcde-utils && git pull && git checkout $1 && git pull && yarn && yarn link
cd ../abcde-test && git pull && git checkout $1 && git pull && yarn && yarn link
cd ../abcde-backend && git pull && git checkout $1 && git pull && yarn
cd ../abcde-frontend && yarn link abcde-utils && yarn link abcde-test
cd ../abcde-backend && yarn link abcde-utils && yarn link abcde-test
cd ../abcde-test && yarn link abcde-utils