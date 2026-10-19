import { renderAndSanitizeMarkdown, sharedSanitizeSchema } from '../src/lib/markdown';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

function generate2000WordPost(): string {
  const codeBlock1 = `\`\`\`typescript
interface ClusterConfig {
  nodes: number;
  provider: 'k3s' | 'k8s';
  telemetry: { prometheus: boolean; loki: boolean; grafana: boolean };
}
export async function bootstrapCluster(config: ClusterConfig): Promise<void> {
  console.log('Bootstrapping cluster with nodes:', config.nodes);
}
\`\`\``;

  const codeBlock2 = `\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -
kubectl get nodes -o wide
\`\`\``;

  const codeBlock3 = `\`\`\`sql
CREATE TABLE IF NOT EXISTS system_metrics (
  id TEXT PRIMARY KEY,
  node_name TEXT NOT NULL,
  cpu_percent REAL NOT NULL,
  memory_used_mb INTEGER NOT NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded ON system_metrics(recorded_at);
\`\`\``;

  const codeBlock4 = `\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telemetry-agent
  labels:
    app: telemetry
spec:
  replicas: 3
  selector:
    matchLabels:
      app: telemetry
  template:
    metadata:
      labels:
        app: telemetry
    spec:
      containers:
      - name: agent
        image: sodops/telemetry:v1.2.0
\`\`\``;

  const codeBlock5 = `\`\`\`rust
use std::time::Duration;
use tokio::time::sleep;

#[tokio::main]
async fn main() {
    println!("Starting telemetry listener on socket...");
    sleep(Duration::from_millis(500)).await;
    println!("Connection established successfully.");
}
\`\`\``;

  const paragraph = `In modern cloud infrastructure, managing edge services and containerized environments requires high observability, predictable latencies, and distributed storage redundancy. When architecting multi-region deployments, systems engineers must balance cost efficiency with uptime guarantees. Cloudflare Workers provides an exceptional serverless execution model with sub-millisecond cold starts, but its free tier imposes a strict 10 millisecond CPU ceiling per HTTP request. Operating within this constraint requires careful measurement of runtime computation, eliminating heavy AST transformations, and pushing CPU-intensive rendering to build or save time. Observability pipelines with Prometheus, Grafana, and Loki form the bedrock of production monitoring, giving granular visibility into container states, network ingress, and memory utilization across nodes.\n\n`;

  let content = `# Architectural Deep Dive: Observability at Scale\n\n`;
  content += paragraph.repeat(4);
  content += `## Cluster Provisioning\n\n` + codeBlock1 + `\n\n`;
  content += paragraph.repeat(4);
  content += `## Deployment Scripts\n\n` + codeBlock2 + `\n\n`;
  content += paragraph.repeat(4);
  content += `## Metrics Database Schema\n\n` + codeBlock3 + `\n\n`;
  content += paragraph.repeat(4);
  content += `## Kubernetes Manifests\n\n` + codeBlock4 + `\n\n`;
  content += paragraph.repeat(4);
  content += `## High-Performance Telemetry Agent\n\n` + codeBlock5 + `\n\n`;
  content += paragraph.repeat(4);

  return content;
}

async function runBenchmark() {
  const post = generate2000WordPost();
  const wordCount = post.trim().split(/\s+/).length;
  console.log(`Generated realistic post with ${wordCount} words and 5 code blocks.`);

  // 1. Benchmark full server-side markdown + syntax highlight + sanitize
  console.log('\n--- 1. Testing Full Server-Side Compilation (Remark + Rehype-Highlight + Rehype-Sanitize) ---');
  for (let i = 1; i <= 3; i++) {
    const startCpu = process.cpuUsage();
    const startWall = performance.now();
    await renderAndSanitizeMarkdown(post);
    const endWall = performance.now();
    const endCpu = process.cpuUsage(startCpu);
    const cpuMs = (endCpu.user + endCpu.system) / 1000;
    console.log(`Run ${i}: Wall clock = ${(endWall - startWall).toFixed(2)}ms, CPU time = ${cpuMs.toFixed(2)}ms`);
  }

  // 2. Pre-rendered HTML + server-side sanitize only (rehype-sanitize on pre-rendered HTML)
  console.log('\n--- 2. Testing Pre-Rendered HTML (Browser renders, Server runs Rehype-Sanitize ONLY) ---');
  const renderedHtml = await renderAndSanitizeMarkdown(post);
  for (let i = 1; i <= 3; i++) {
    const startCpu = process.cpuUsage();
    const startWall = performance.now();
    await unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeSanitize as any, sharedSanitizeSchema)
      .use(rehypeStringify)
      .process(renderedHtml);
    const endWall = performance.now();
    const endCpu = process.cpuUsage(startCpu);
    const cpuMs = (endCpu.user + endCpu.system) / 1000;
    console.log(`Run ${i}: Wall clock = ${(endWall - startWall).toFixed(2)}ms, CPU time = ${cpuMs.toFixed(2)}ms`);
  }
}

runBenchmark().catch(console.error);
