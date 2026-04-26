. ./activate.sh
./cleanup.sh && \
./scripts/bundle_node_runtime.sh && \
./scripts/install_sidecars.sh && \
cd frontend && pnpm build && cd .. && \
mkdir -p backend/setta/static && \
cp -r frontend/dist backend/setta/static/frontend && \
./scripts/build_python_distribution_with_go_binaries.sh --skip-cleanup
