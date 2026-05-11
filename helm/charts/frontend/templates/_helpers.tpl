{{/*
Expand the name of the chart.
*/}}
{{- define "zabbix-portal-frontend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "zabbix-portal-frontend.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "zabbix-portal-frontend.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "zabbix-portal-frontend.labels" -}}
helm.sh/chart: {{ include "zabbix-portal-frontend.chart" . }}
{{ include "zabbix-portal-frontend.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "zabbix-portal-frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "zabbix-portal-frontend.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "zabbix-portal-frontend.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "zabbix-portal-frontend.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Derive the backend service name for nginx proxy_pass.
Uses .Values.backendServiceName if set; otherwise constructs from release name.
*/}}
{{- define "zabbix-portal-frontend.backendServiceName" -}}
{{- if .Values.backendServiceName }}
{{- .Values.backendServiceName }}
{{- else }}
{{- printf "%s-zabbix-portal-backend" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
