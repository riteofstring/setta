./cleanup.sh && \
cd frontend && pnpm build && cd .. && \
cp -r frontend/dist python/runcoder/frontend && \
cp -r seed python/runcoder/seed && \
python -m build