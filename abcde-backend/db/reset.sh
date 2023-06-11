#!/bin/sh
rm -rf prisma/migrations
npx prisma migrate reset -f "$@"