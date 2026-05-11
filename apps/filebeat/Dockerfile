# =============================================================================
# PRIVATE NETWORK — IMAGE CHANGES REQUIRED
# =============================================================================
#  Stage  | Public image                                              | Replace with
#  ------ | --------------------------------------------------------- | ----------------------------------------------------------
#  (base) | docker.elastic.co/beats/filebeat:8.17.0                   | <your-registry>/docker-virtual/docker.elastic.co/beats/filebeat:8.17.0
# =============================================================================

# PRIVATE NETWORK: change to <your-registry>/docker-virtual/docker.elastic.co/beats/filebeat:8.17.0
FROM docker.elastic.co/beats/filebeat:8.17.0

USER root

COPY filebeat.yml /usr/share/filebeat/filebeat.yml

# Filebeat refuses to start if the config file is group- or world-writable.
RUN chmod go-w /usr/share/filebeat/filebeat.yml \
    && chown root:root /usr/share/filebeat/filebeat.yml

USER filebeat
