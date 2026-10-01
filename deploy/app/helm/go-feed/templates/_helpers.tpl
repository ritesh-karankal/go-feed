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
