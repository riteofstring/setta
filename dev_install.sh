cd frontend && \
npm install && \
cp -r forked/xterm node_modules/xterm && \
cd .. && \
. ./init_env.sh dev && \
./cleanup.sh