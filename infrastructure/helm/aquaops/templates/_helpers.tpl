{{/*
Common labels, applied to every resource this chart manages.
*/}}
{{- define "aquaops.labels" -}}
app.kubernetes.io/part-of: aquaops
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
