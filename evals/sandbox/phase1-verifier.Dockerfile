ARG TOOLCHAIN_IMAGE
FROM ${TOOLCHAIN_IMAGE}

USER 0:0

COPY --chmod=0555 sandbox-helper /usr/local/bin/setta-eval-sandbox-helper
COPY --chmod=0555 verifier /usr/local/bin/setta-eval-verifier

ENV CI=1 \
    HOME=/tmp \
    LANG=C.UTF-8 \
    NO_COLOR=1 \
    PATH=/usr/local/bin:/usr/bin:/bin \
    TMPDIR=/tmp

USER 65532:65532
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/setta-eval-verifier", "--baseline", "/baseline", "--workspace", "/workspace"]
