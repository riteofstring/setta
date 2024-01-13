#!/bin/sh
pid=$(ps -p $$ | awk 'NR ==2{print $4}')
echo $pid
ps
sleep 1000