ARG TOOLCHAIN_IMAGE
FROM ${TOOLCHAIN_IMAGE}

USER 0:0

COPY --chmod=0555 codex /usr/local/bin/codex
COPY --chmod=0555 bwrap /usr/local/bin/codex-resources/bwrap
COPY --chmod=0444 pnpm.cjs /usr/local/lib/pnpm/pnpm.cjs
COPY --chmod=0444 pnpm-license /usr/local/share/licenses/pnpm/LICENSE
COPY --chmod=0555 pnpm /usr/local/bin/pnpm
COPY --chmod=0555 rg /usr/local/bin/rg
COPY --chmod=0555 sandbox-helper /usr/local/bin/setta-eval-sandbox-helper
COPY --chmod=0555 zsh /bin/zsh

ENV HOME=/tmp \
    LANG=C.UTF-8 \
    PATH=/usr/local/bin:/usr/bin:/bin \
    SHELL=/bin/zsh

USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/codex", "exec-server", "--strict-config", "--listen", "stdio://"]
