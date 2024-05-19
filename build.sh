./cleanup.sh && \
cd frontend && pnpm build && cd .. && \
mkdir python/runcoder/static && \
cp -r frontend/dist python/runcoder/static/frontend && \
cp -r seed python/runcoder/static/seed && \
cp -r constants python/runcoder/static/constants && \
python -m build