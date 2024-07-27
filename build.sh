./cleanup.sh && \
cd frontend && pnpm build && cd .. && \
mkdir backend/runcoder/static && \
cp -r frontend/dist backend/runcoder/static/frontend && \
cp -r seed backend/runcoder/static/seed && \
cp -r constants backend/runcoder/static/constants && \
python -m build