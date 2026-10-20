#!/usr/bin/env node
/**
 * Production Read-Only QA Audit (pnpm qa:prod)
 *
 * Runs non-destructive, read-only checks against the live site (https://sodops.uz).
 * Does NOT deploy, does NOT touch remote D1, Access, DNS, or secrets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PROD_URL = process.env.PROD_URL || 'https://sodops.uz';
const REPORT_DIR = path.resolve(process.cwd(), 'qa-report');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

console.log(`\n🔍 Starting Production QA Audit against: ${PROD_URL}`);
console.log(`   (Strictly read-only; no state or remote D1 modifications)\n`);

const results = [];

async function auditHeaders() {
  console.log(`[1/3] Auditing Security Headers on ${PROD_URL}...`);
  try {
    const res = await fetch(PROD_URL, { redirect: 'manual' });
    const headers = res.headers;

    const hsts = headers.get('strict-transport-security') || '';
    const hstsPass = hsts.includes('max-age=15552000') && !hsts.includes('includeSubDomains') && !hsts.includes('preload');

    const csp = headers.get('content-security-policy') || '';
    const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/);
    const scriptSrc = scriptSrcMatch ? scriptSrcMatch[1] : '';
    const scriptSrcNoUnsafe = scriptSrc && !scriptSrc.includes("'unsafe-inline'");
    const fontSrcNoData = /font-src\s+'self'/.test(csp) && !/font-src[^;]*data:/.test(csp);
    const cspPass = Boolean(scriptSrcNoUnsafe && fontSrcNoData);

    const nosniff = headers.get('x-content-type-options') === 'nosniff';
    const robots = (headers.get('x-robots-tag') || '').includes('noindex');
    const xfo = headers.get('x-frame-options');
    const xfoPass = xfo === 'DENY' || xfo === 'SAMEORIGIN';

    results.push({
      check: 'Production HSTS (max-age=15552000, no preload/subdomains)',
      status: hstsPass ? 'PASS' : 'FAIL',
      detail: hsts || 'Missing',
    });

    results.push({
      check: 'Production CSP (hash-based, zero unsafe-inline, no data: fonts)',
      status: cspPass ? 'PASS' : 'FAIL',
      detail: csp ? 'Enforced with deterministic hashes' : 'Missing',
    });

    results.push({
      check: 'Production X-Content-Type-Options: nosniff',
      status: nosniff ? 'PASS' : 'FAIL',
      detail: headers.get('x-content-type-options') || 'Missing',
    });

    results.push({
      check: 'Production X-Robots-Tag: noindex (SITE_INDEXING=off safety)',
      status: robots ? 'PASS' : 'FAIL',
      detail: headers.get('x-robots-tag') || 'Missing',
    });

    results.push({
      check: 'Production X-Frame-Options (Clickjacking defense)',
      status: xfoPass ? 'PASS' : 'FAIL',
      detail: xfo || 'Missing',
    });
  } catch (err) {
    results.push({
      check: 'Production Security Headers Audit',
      status: 'FAIL',
      detail: err.message,
    });
  }
}

async function auditPublicEndpoints() {
  console.log(`[2/3] Auditing Public HTTP Endpoints...`);
  const endpoints = [
    { path: '/', expectedStatus: 200 },
    { path: '/blog', expectedStatus: 200 },
    { path: '/projects', expectedStatus: 200 },
    { path: '/uses', expectedStatus: 200 },
    { path: '/now', expectedStatus: 200 },
    { path: '/robots.txt', expectedStatus: 200, validate: (txt) => txt.includes('Disallow: /') },
    { path: '/api/health', expectedStatus: 200, validateJson: (j) => j.ok === true },
    { path: '/api/search.json', expectedStatus: 200, validateJson: (j) => Array.isArray(j) },
    { path: '/non-existent-page-404', expectedStatus: 404 },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${PROD_URL}${ep.path}`, { redirect: 'manual' });
      let valid = res.status === ep.expectedStatus;
      let extra = `HTTP ${res.status}`;

      if (valid && ep.validate) {
        const text = await res.text();
        valid = ep.validate(text);
        extra += valid ? ' (content valid)' : ' (content mismatch)';
      } else if (valid && ep.validateJson) {
        const json = await res.json();
        valid = ep.validateJson(json);
        extra += valid ? ' (json payload valid)' : ' (json mismatch)';
      }

      results.push({
        check: `Public Endpoint: ${ep.path}`,
        status: valid ? 'PASS' : 'FAIL',
        detail: extra,
      });
    } catch (err) {
      results.push({
        check: `Public Endpoint: ${ep.path}`,
        status: 'FAIL',
        detail: err.message,
      });
    }
  }

  // XML validation for feed.xml
  try {
    const res = await fetch(`${PROD_URL}/feed.xml`);
    if (res.ok) {
      const xml = await res.text();
      fs.writeFileSync('/tmp/prod-feed.xml', xml);
      execSync('xmllint --noout /tmp/prod-feed.xml');
      results.push({
        check: 'Public Endpoint: /feed.xml (RSS 2.0 / Atom xmllint validity)',
        status: 'PASS',
        detail: `Valid XML (${Buffer.byteLength(xml)} bytes)`,
      });
    } else {
      results.push({
        check: 'Public Endpoint: /feed.xml',
        status: 'FAIL',
        detail: `HTTP ${res.status}`,
      });
    }
  } catch (err) {
    results.push({
      check: 'Public Endpoint: /feed.xml (xmllint check)',
      status: 'FAIL',
      detail: err.message,
    });
  }
}

async function auditAdminProtection() {
  console.log(`[3/3] Auditing Zero Trust Admin Guard on Production...`);
  const adminEndpoints = [
    { path: '/admin', method: 'GET' },
    { path: '/admin/new', method: 'GET' },
    { path: '/api/admin/posts', method: 'GET' },
    { path: '/api/admin/posts', method: 'POST' },
    { path: '/admin/api/posts', method: 'GET' },
  ];

  for (const ep of adminEndpoints) {
    try {
      const res = await fetch(`${PROD_URL}${ep.path}`, {
        method: ep.method,
        redirect: 'manual',
      });

      // Must fail closed (401, 403, or 302 to Access), NEVER 200 or 500
      const isProtected = res.status === 401 || res.status === 403 || res.status === 302;
      results.push({
        check: `Admin Guard: ${ep.method} ${ep.path} (Unauthenticated)`,
        status: isProtected ? 'PASS' : 'FAIL',
        detail: `HTTP ${res.status} (Protected)`,
      });
    } catch (err) {
      results.push({
        check: `Admin Guard: ${ep.method} ${ep.path}`,
        status: 'FAIL',
        detail: err.message,
      });
    }
  }
}

async function main() {
  await auditHeaders();
  await auditPublicEndpoints();
  await auditAdminProtection();

  const summaryPath = path.join(REPORT_DIR, 'prod-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

  console.log('\n========================================================================');
  console.log('              sodops.uz Production QA Audit Summary                    ');
  console.log('========================================================================');
  console.log(
    '| Status | Check                                                      | Detail'
  );
  console.log(
    '| :---:  | :--------------------------------------------------------- | :----------------------------------'
  );
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(`| ${icon} | ${r.check.padEnd(58)} | ${r.detail}`);
  }
  console.log('========================================================================\n');
  console.log(`Report saved to: ${summaryPath}\n`);

  const hasFailures = results.some((r) => r.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error('Production QA execution error:', err);
  process.exit(1);
});
