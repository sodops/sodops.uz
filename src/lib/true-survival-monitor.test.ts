import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureTrueSurvivalLandingMonitor } from './true-survival-monitor';

function makeDb(
  legacy: { id: string; name: string; status: string; check_type: string; url: string } | null,
  landing: { id: string } | null
) {
  const batches: Array<Array<{ sql: string; args: unknown[] }>> = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        args: [] as unknown[],
        bind(...args: unknown[]) { this.args = args; return this; },
        async first() {
          if (sql.includes('WHERE id = ?')) return this.args[0] === 'proj_mc_sodops_uz' ? legacy : landing;
          return null;
        },
      };
      return statement;
    },
    async batch(statements: Array<{sql: string; args: unknown[]}>) {
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
  return { db: db as unknown as D1Database, batches };
}

describe('True Survival monitoring migration', () => {
  const legacy = {
    id: 'proj_mc_sodops_uz', name: 'mc.sodops.uz', status: 'active',
    check_type: 'minecraft', url: 'https://mc.sodops.uz'
  };
  it('pauses the future Minecraft server and creates an HTTPS landing monitor in one batch', async () => {
    const mock = makeDb(legacy, null);
    assert.equal(await ensureTrueSurvivalLandingMonitor(mock.db), true);
    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0].length, 2);
    assert.match(mock.batches[0][0].sql, /status = 'paused'/);
    assert.match(mock.batches[0][1].sql, /'http'/);
    assert.ok(mock.batches[0][1].args.includes('https://mc.sodops.uz'));
    assert.equal(mock.batches[0].some(s => /DELETE FROM uptime/.test(s.sql)), false);
  });
  it('does not make changes after migration', async () => {
    const mock = makeDb({...legacy, name: 'True Survival Minecraft Server', status: 'paused'}, {id:'proj_true_survival_landing'});
    assert.equal(await ensureTrueSurvivalLandingMonitor(mock.db), false);
    assert.equal(mock.batches.length, 0);
  });
  it('never changes a future replacement server configuration', async () => {
    const mock = makeDb({...legacy, check_type:'http'}, null);
    assert.equal(await ensureTrueSurvivalLandingMonitor(mock.db), false);
    assert.equal(mock.batches.length, 0);
  });
  it('never creates a landing project if legacy project is absent', async () => {
    const mock = makeDb(null, null);
    assert.equal(await ensureTrueSurvivalLandingMonitor(mock.db), false);
    assert.equal(mock.batches.length, 0);
  });
});
