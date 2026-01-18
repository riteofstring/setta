. ./activate.sh
./cleanup.sh && \
./scripts/install_sidecars.sh && \
cd frontend && pnpm build && cd .. && \
mkdir backend/setta/static && \
cp -r frontend/dist backend/setta/static/frontend && \
python -m build
