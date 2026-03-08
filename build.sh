. ./activate.sh
./cleanup.sh && \
./scripts/build_packaged_go_binaries.sh && \
./scripts/bundle_node_runtime.sh && \
./scripts/install_sidecars.sh && \
cd frontend && pnpm build && cd .. && \
mkdir backend/setta/static && \
cp -r frontend/dist backend/setta/static/frontend && \
python -m build
