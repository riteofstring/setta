cd frontend && \
npm install && \
rm -rf node_modules/xterm && \
cp -r forked/xterm node_modules/xterm && \
cd .. && \
. ./init_env.sh dev && \
./cleanup.sh