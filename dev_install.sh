. ./init_env.sh && \
cd frontend && \
pnpm install && \
cd .. && \
./scripts/install_sidecars.sh && \
./cleanup.sh
