FROM gcr.io/distroless/static-debian12@sha256:597c2b4bc7f353100af9b8b06bb4f126c4a45f9d8175e25d4f01f965d5d94396

COPY --chown=0:0 setta-control-plane-linux-amd64 /usr/local/bin/setta-control-plane

USER 0:0
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/setta-control-plane"]
CMD ["serve"]
