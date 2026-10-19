---
title: 'Minimal Observability: Monitoring k3s with Prometheus & Grafana'
slug: 'minimal-observability-k3s'
published_at: 2026-10-15T09:00:00Z
excerpt: 'Setting up lightweight metrics and logging on edge Kubernetes clusters without eating all your RAM.'
cover_image: ''
draft: false
tags: ['k3s', 'prometheus', 'grafana', 'devops']
reading_time_minutes: 4
---

Running Kubernetes in edge environments or homelab setups (such as single-board computers or low-spec VPS instances) often runs into a common issue: the standard `kube-prometheus-stack` can consume more memory than the actual workloads running on the cluster.

In this post, I want to outline a minimal, resource-conscious observability stack for **k3s** that gives you actionable metrics and dashboards while consuming less than 350MB of RAM total.

## The Architecture

Instead of deploying the full Prometheus Operator with alertmanager, pushgateway, and multiple sidecars, we strip the architecture down to three core components:

1. **Prometheus (Agent Mode)** or a single-replica Prometheus with short retention (3-7 days).
2. **Node Exporter & Kube-State-Metrics** configured with targeted scrape metrics.
3. **Grafana** deployed with pre-baked dashboard ConfigMaps, eliminating dynamic state where possible.

```
+----------------------------------------------------+
|                   k3s Node                         |
|                                                    |
|  +---------------+        +---------------------+  |
|  | node-exporter |  <---  |  Prometheus Server  |  |
|  +---------------+        |     (5s scrape)     |  |
|                           +----------+----------+  |
|                                      |             |
|                                      v             |
|                              +---------------+     |
|                              |    Grafana    |     |
|                              +---------------+     |
+----------------------------------------------------+
```

## Configuring Prometheus Retention

The biggest RAM and disk eater in default Prometheus setups is chunk storage and retention time. When running on low-resource nodes, limit local retention strictly:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: monitoring
spec:
  template:
    spec:
      containers:
        - name: prometheus
          image: prom/prometheus:v2.51.0
          args:
            - '--config.file=/etc/prometheus/prometheus.yml'
            - '--storage.tsdb.path=/prometheus'
            - '--storage.tsdb.retention.time=7d'
            - '--storage.tsdb.min-block-duration=2h'
            - '--storage.tsdb.max-block-duration=2h'
            - '--web.enable-lifecycle'
          resources:
            requests:
              memory: '150Mi'
              cpu: '50m'
            limits:
              memory: '300Mi'
              cpu: '250m'
```

## Dropping Unneeded Metrics

By default, `kube-state-metrics` emits thousands of gauge metrics you likely never look at on a small cluster. In your `scrape_configs`, drop verbose label dimensions:

```yaml
scrape_configs:
  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: '(node_network_receive_multicast_total|node_network_transmit_colls_total)'
        action: drop
```

## Logging with Loki and Promtail

For log aggregation, running full Elasticsearch or OpenSearch on a small cluster is out of the question. Grafana Loki is designed specifically for this use case because it indexes metadata (labels), not the log payload itself.

On a k3s cluster, deploying Promtail as a `DaemonSet` with memory limits capped at 50MB per node forwards container logs directly to Loki without causing OOM kills.

## Conclusion

Observability does not require gigabytes of overhead. By being deliberate about scrape intervals, dropping extraneous time series, and tuning TSDB retention, you can achieve enterprise-grade visibility on edge nodes running on modest hardware.
