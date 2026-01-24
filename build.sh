. ./activate.sh
./cleanup.sh && \
cd frontend && pnpm build && cd .. && \
mkdir backend/setta/static && \
cp -r frontend/dist backend/setta/static/frontend && \
python -m build