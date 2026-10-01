{{- define "gopher-feed.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}


{{/*
DB_ADDR override pointing at the in-cluster Postgres. Overrides the value
from the secret; $(POSTGRES_PASSWORD) is expanded by Kubernetes from the
envFrom secret. The password must be URL-safe.
*/}}
{{- define "gopher-feed.dbAddrEnv" -}}
{{- if .Values.postgres.enabled }}
- name: DB_ADDR
  value: "postgres://{{ .Values.postgres.user }}:$(POSTGRES_PASSWORD)@{{ .Values.postgres.name }}:{{ .Values.postgres.port }}/{{ .Values.postgres.database }}?sslmode=disable"
{{- end }}
{{- end -}}


{{/*
Redis settings for the API when the in-cluster Redis is enabled. Overrides
REDIS_ADDR/REDIS_ENABLED from the secret; REDIS_PW still comes from it.
*/}}
{{- define "gopher-feed.redisEnv" -}}
{{- if .Values.redis.enabled }}
- name: REDIS_ADDR
  value: "{{ .Values.redis.name }}:{{ .Values.redis.port }}"
- name: REDIS_ENABLED
  value: "true"
{{- end }}
{{- end -}}
