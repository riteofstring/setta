./cleanup.sh && \
cd frontend && npm run build && cd .. && \
cp -r frontend/dist python/runcoder/frontend && \
cp -r seed python/runcoder/seed && \
python -m build