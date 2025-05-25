./cleanup.sh && \
cd frontend && pnpm build && cd .. && \
mkdir backend/setta/static && \
cp -r frontend/dist backend/setta/static/frontend && \
cp -r seed backend/setta/static/seed && \
python -m build