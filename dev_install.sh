. ./init_env.sh && \
cd frontend && \
pnpm install --frozen-lockfile && \
cd .. && \
./scripts/install_sidecars.sh && \
./cleanup.sh
