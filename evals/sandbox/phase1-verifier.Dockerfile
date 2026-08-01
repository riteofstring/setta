ARG TOOLCHAIN_IMAGE
FROM ${TOOLCHAIN_IMAGE}

USER 0:0

COPY --chmod=0555 sandbox-helper /usr/local/bin/setta-eval-sandbox-helper
COPY --chmod=0444 pnpm.cjs /usr/local/lib/pnpm/pnpm.cjs
COPY --chmod=0444 pnpm-license /usr/local/share/licenses/pnpm/LICENSE
COPY --chmod=0555 pnpm /usr/local/bin/pnpm
COPY --chmod=0555 verifier /usr/local/bin/setta-eval-verifier

ENV CI=1 \
    HOME=/tmp \
    LANG=C.UTF-8 \
    NO_COLOR=1 \
    PATH=/usr/local/bin:/usr/bin:/bin \
    TMPDIR=/tmp

USER 65532:65532
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/setta-eval-verifier"]
