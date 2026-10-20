import { execSync } from 'node:child_process';
import fs from 'node:fs';

const pages = [
  { name: 'Home (/)', url: 'http://localhost:8787/' },
  { name: 'Blog (/blog)', url: 'http://localhost:8787/blog' },
  { name: 'Projects & Status (/projects)', url: 'http://localhost:8787/projects' },
  { name: 'Blog Post (/blog/local-audit-post)', url: 'http://localhost:8787/blog/local-audit-post' },
];

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function runAudit() {
  console.log('========================================================================');
  console.log('Lighthouse Mobile Audit: 3 Runs Per Route (Computing Medians)');
  console.log('========================================================================\n');

  const summary = [];

  for (const page of pages) {
    console.log(`Running 3 mobile audits for ${page.name}...`);
    const perfScores = [];
    const a11yScores = [];
    const bpScores = [];
    const seoScores = [];

    for (let run = 1; run <= 3; run++) {
      const outPath = `/tmp/lh_${page.name.replace(/[^a-zA-Z0-9]/g, '_')}_run${run}.json`;
      const cmd = `npx --yes lighthouse "${page.url}" --chrome-flags="--headless --no-sandbox --disable-gpu" --output=json --output-path="${outPath}" --only-categories=performance,accessibility,best-practices,seo --quiet`;
      try {
        execSync(cmd, { stdio: 'pipe' });
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const perf = Math.round((data.categories.performance?.score ?? 0) * 100);
        const a11y = Math.round((data.categories.accessibility?.score ?? 0) * 100);
        const bp = Math.round((data.categories['best-practices']?.score ?? 0) * 100);
        const seo = Math.round((data.categories.seo?.score ?? 0) * 100);

        perfScores.push(perf);
        a11yScores.push(a11y);
        bpScores.push(bp);
        seoScores.push(seo);
        console.log(`  Run ${run}: Performance = ${perf}, Accessibility = ${a11y}, Best Practices = ${bp}, SEO = ${seo}`);
      } catch (err) {
        console.error(`  Run ${run} failed:`, err.message);
      }
    }

    const medPerf = median(perfScores);
    const medA11y = median(a11yScores);
    const medBp = median(bpScores);
    const medSeo = median(seoScores);

    console.log(`\n=> Median for ${page.name}:`);
    console.log(`   Performance: ${medPerf} | Accessibility: ${medA11y} | Best Practices: ${medBp} | SEO: ${medSeo}\n`);

    summary.push({
      page: page.name,
      perfScores,
      a11yScores,
      medPerf,
      medA11y,
      medBp,
      medSeo,
    });
  }

  console.log('\n========================================================================');
  console.log('FINAL AUDIT SUMMARY TABLE (Mobile, 3 Runs, Median)');
  console.log('========================================================================');
  console.log('| Page | Performance (Runs -> Median) | Accessibility (Median) | Best Practices | SEO |');
  console.log('| :--- | :--- | :--- | :--- | :--- |');
  for (const s of summary) {
    console.log(
      `| ${s.page} | [${s.perfScores.join(', ')}] -> **${s.medPerf}** | **${s.medA11y}** | **${s.medBp}** | **${s.medSeo}** |`
    );
  }
}

runAudit().catch(console.error);
