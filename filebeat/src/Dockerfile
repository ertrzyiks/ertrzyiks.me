FROM docker.elastic.co/beats/filebeat:6.3.0
USER root
COPY filebeat.yml /usr/share/filebeat/filebeat.yml
RUN chown root /usr/share/filebeat/filebeat.yml
RUN chmod go-w /usr/share/filebeat/filebeat.yml
