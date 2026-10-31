// Where the server keeps its data. With DATABASE_URL set it uses Postgres (one key/value table), so
// accounts and workspaces survive redeploys on hosts with throwaway disks such as Render's free plan.
// Otherwise JSON files under DATA_DIR, laid out as before (db.json, ws/<id>.json, pdf/<ws>/<hash>.json).
import fs from 'node:fs/promises'
import path from 'node:path'

export async function openStorage({ dir, url }) {
  let backend
  if (url) {
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL) || 4 })
    await pool.query('create table if not exists kv (key text primary key, value text not null, updated_at timestamptz not null default now())')
    backend = {
      kind: 'postgres',
      get: async k => (await pool.query('select value from kv where key = $1', [k])).rows[0]?.value ?? null,
      put: async (k, v) => { await pool.query('insert into kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()', [k, v]) },
      // Removes a key and everything stored under "key/".
      del: async k => { await pool.query("delete from kv where key = $1 or key like $2 escape '\\'", [k, k.replace(/[\\%_]/g, m => '\\' + m) + '/%']) },
    }
  } else {
    const file = k => path.join(dir, `${k}.json`)
    backend = {
      kind: 'files',
      get: k => fs.readFile(file(k), 'utf8').catch(() => null),
      // Atomic: write a temp file, then rename over the original.
      put: async (k, v) => { const f = file(k); await fs.mkdir(path.dirname(f), { recursive: true }); const tmp = `${f}.${process.pid}.tmp`; await fs.writeFile(tmp, v); await fs.rename(tmp, f) },
      del: async k => { await fs.rm(file(k), { force: true }); await fs.rm(path.join(dir, k), { recursive: true, force: true }) },
    }
  }
  // Writes are serialised so a slow older write can never land after a newer one.
  let chain = Promise.resolve()
  return {
    kind: backend.kind,
    get: backend.get,
    getJson: async (k, d) => { const v = await backend.get(k); return v == null ? d : JSON.parse(v) },
    put: (k, v) => { const p = chain.then(() => backend.put(k, v)); chain = p.catch(() => {}); return p },
    putJson(k, v) { return this.put(k, JSON.stringify(v)) },
    del: k => { const p = chain.then(() => backend.del(k)); chain = p.catch(() => {}); return p },
  }
}
