FROM n8nio/n8n:latest

# Railway persistent volumes are mounted as root-owned by default.
# n8n runs as a non-root user in the upstream image, which can cause EACCES
# when writing to the mounted volume (e.g. /data).
#
# On Railway, the simplest reliable fix is to run n8n as root.
USER root

# Keep default entrypoint/cmd from upstream image.
