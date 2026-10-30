// Auto-build: the platform writes a complete, runnable reproduction codebase for a Lab project.
// With a Claude key it plans the files, writes them one by one (each seeing the files before it), then
// self-reviews and rewrites what is broken. Without a key it emits a structured template to fill in.
// The code runs where free GPUs are (Colab notebook / zip); results come back through RESULTS_JSON.
import { askClaude } from './ai.js'
import { passages } from './nlp.js'
import { pySafe } from './reproduce.js'

const MARK = 'RESULTS_JSON:'
// File paths end up in shell lines of the Colab notebook (mkdir, %%writefile), so only plain relative paths.
export const safePath = p => typeof p === 'string' && p.length < 120 && /^[\w.-]+(\/[\w.-]+)*$/.test(p) && !p.split('/').some(x => x === '..' || x === '.')
export function normBuild(b) {
  if (!b || typeof b !== 'object' || !b.files || typeof b.files !== 'object') return undefined
  const files = Object.fromEntries(Object.entries(b.files).filter(([p, c]) => safePath(p) && typeof c === 'string'))
  const plan = b.plan && typeof b.plan === 'object' ? { files: (Array.isArray(b.plan.files) ? b.plan.files : []).filter(f => safePath(f?.path)).map(f => ({ path: f.path, purpose: String(f.purpose || '') })), requirements: (Array.isArray(b.plan.requirements) ? b.plan.requirements : []).map(String), notes: String(b.plan.notes || '') } : { files: [], requirements: [], notes: '' }
  return { ...b, files, plan }
}
const fence = t => t.replace(/^\s*```[\w.-]*\s*\n/, '').replace(/\n```\s*$/, '').trimEnd() + '\n'
const json = t => JSON.parse(t.match(/[[{][\s\S]*[\]}]/)[0])

function context(project, paper) {
  const s = project.spec
  const ex = paper?.body ? [...new Set(['method architecture', 'implementation details', 'experimental setup hyperparameters', 'evaluation metric', ...s.components].flatMap(q => passages(paper.body, q, 2, 900)))].slice(0, 10) : []
  return `Target: ${project.source.type === 'paper' ? `reproduce the paper "${project.title}"` : `test the research idea "${s.summary}"`}
${paper ? `Abstract: ${paper.abstract}` : ''}
Spec: ${JSON.stringify({ summary: s.summary, components: s.components, datasets: s.datasets, models: s.models, hparams: s.hparams.map(h => `${h.name}=${h.value}`), metrics: s.metrics.map(m => `${m.name}${m.paper ? ` (paper: ${m.paper})` : ''}`), compute: s.compute, code: s.code, baselines: s.baselines, missing: s.missing })}
${ex.length ? `Paper excerpts:\n${ex.map(e => `> ${e}`).join('\n')}` : ''}`
}

const RULES = `Rules for the codebase:
- Python 3.10+, PyTorch and Hugging Face (datasets/transformers) where useful; for LLM-API methods use the openai or anthropic SDK with the key from an environment variable.
- run.py is the entry point. "python run.py --smoke" must finish in under 3 minutes on a free Colab T4 (or CPU) using a tiny data subset and tiny model, so the whole pipeline is exercised end to end.
- "python run.py" runs the real experiment with the paper's settings from config.py.
- run.py must print, as its last line, ${MARK} followed by a one-line JSON object mapping each metric name to its value.
- Every setting the paper does not state gets a default in config.py with a "# ASSUMPTION:" comment.
- Real, complete code: no placeholders, no "pass  # TODO", no ellipses.`

export const planPrompt = (project, paper) => `${context(project, paper)}

You are a senior ML engineer. Design the codebase that ${project.source.type === 'paper' ? 'reproduces this paper' : 'runs this experiment against its baseline'}.
${RULES}
Respond ONLY with JSON: {"files": [{"path": "config.py", "purpose": "what it contains and its main functions/classes with signatures"}], "requirements": ["torch", ...], "notes": "one paragraph on key design decisions and assumptions"}
Use 5-9 files: always README.md, requirements.txt, config.py, run.py, plus data, model/method and evaluation modules.`

const filePrompt = (project, paper, plan, path, written, issues) => `${context(project, paper)}

${RULES}
Codebase plan:
${plan.files.map(f => `- ${f.path}: ${f.purpose}`).join('\n')}
Requirements: ${plan.requirements.join(', ')}
Design notes: ${plan.notes || '-'}

${Object.keys(written).length ? `Files already written (match their names, imports and signatures exactly):\n${Object.entries(written).filter(([p]) => p !== path).map(([p, c]) => `### ${p}\n${c.length > 6000 ? `${c.slice(0, 6000)}\n# …truncated` : c}`).join('\n\n')}` : ''}
${issues?.length ? `\nThe current version of ${path} has these problems; fix all of them:\n${issues.map(i => `- ${i}`).join('\n')}\n\nCurrent version:\n${written[path] || ''}` : ''}

Write the complete contents of ${path}. Reply with the file content only, no Markdown fences, no commentary.`

const reviewPrompt = (project, files) => `You are reviewing a generated research codebase (${project.title}) before it is run.
${RULES}

${Object.entries(files).map(([p, c]) => `### ${p}\n${c}`).join('\n\n')}

Find real bugs only: wrong imports or names between files, signature mismatches, shape errors, missing config keys, a --smoke path that would not run, the missing ${MARK} line, placeholder code.
Respond ONLY with JSON: [{"path": "file.py", "problem": "specific problem and fix"}]. Respond [] if it is correct.`

// Runs the plan → write → review → fix loop. `log` reports progress; `save` persists partial work.
export async function generateCodebase({ settings, project, paper, log, save }) {
  log('Designing the codebase…')
  const plan = json(await askClaude(settings, { prompt: planPrompt(project, paper), maxTokens: 3000 }))
  plan.files = (Array.isArray(plan.files) ? plan.files : []).filter(f => safePath(f?.path)).slice(0, 10)
  plan.requirements = (Array.isArray(plan.requirements) ? plan.requirements : []).map(String).filter(r => /^[\w.\-\[\],<>=!~ ]+$/.test(r))
  if (!plan.files.length) throw new Error('The model returned no file plan')
  const files = {}
  for (const [i, f] of plan.files.entries()) {
    log(`Writing ${f.path} (${i + 1}/${plan.files.length})…`)
    files[f.path] = f.path === 'requirements.txt' ? `${plan.requirements.join('\n')}\n` : fence(await askClaude(settings, { prompt: filePrompt(project, paper, plan, f.path, files), maxTokens: 8000 }))
    save({ plan, files: { ...files } })
  }
  for (let round = 1; round <= 2; round++) {
    log(`Reviewing the code (pass ${round})…`)
    let issues = []
    try { issues = json(await askClaude(settings, { prompt: reviewPrompt(project, files), maxTokens: 3000 })).filter(x => x?.path in files) } catch { issues = [] }
    if (!issues.length) { log('Review passed'); break }
    const by = Object.groupBy ? Object.groupBy(issues, x => x.path) : issues.reduce((m, x) => ((m[x.path] ||= []).push(x), m), {})
    for (const [path, list] of Object.entries(by)) {
      log(`Fixing ${path}: ${list.length} issue${list.length > 1 ? 's' : ''}…`)
      files[path] = fence(await askClaude(settings, { prompt: filePrompt(project, paper, plan, path, files, list.map(x => x.problem)), maxTokens: 8000 }))
      save({ plan, files: { ...files } })
    }
  }
  return { plan, files }
}

// Rewrites single files to fix concrete errors (from the syntax check or the user's own run).
export async function fixFiles({ settings, project, paper, build, problems, log }) {
  const files = { ...build.files }
  for (const [path, list] of Object.entries(problems)) {
    log(`Fixing ${path}…`)
    files[path] = fence(await askClaude(settings, { prompt: filePrompt(project, paper, build.plan, path, files, list), maxTokens: 8000 }))
  }
  return files
}

// Without a key: the same layout as a template with every TODO spelled out from the spec.
export function localCodebase(project) {
  const s = pySafe(project.spec)
  const key = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const cls = c => c.replace(/[^\w ]/g, ' ').trim().split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join('').slice(0, 40) || 'Method'
  const comps = s.components.length ? s.components : ['Method']
  const metrics = s.metrics.map(m => m.name).filter(Boolean)
  const plan = {
    files: [['README.md', 'How to run'], ['requirements.txt', 'Dependencies'], ['config.py', 'All settings'], ['data.py', 'Data loading'], ['method.py', 'The method'], ['evaluate.py', 'Metrics'], ['run.py', 'Entry point']].map(([path, purpose]) => ({ path, purpose })),
    requirements: s.training ? ['torch', 'datasets', 'numpy', 'tqdm'] : ['datasets', 'numpy', 'anthropic', 'tqdm'], notes: 'Template generated locally. Add a Claude API key in Settings to have the platform write the full implementation.',
  }
  const files = {
    'README.md': `# ${project.title}\n\nReproduction codebase generated by AI Research OS · Reproduce Lab.\n\n${s.summary}\n\n## Run\n\n\`\`\`bash\npip install -r requirements.txt\npython run.py --smoke   # tiny end-to-end check\npython run.py           # full experiment\n\`\`\`\n\nThe last line printed is \`${MARK} {...}\`; paste it into the Lab scorecard.\n\n## Not stated in the paper\n${s.missing.map(m => `- ${m}`).join('\n') || '- nothing flagged'}\n`,
    'requirements.txt': `${plan.requirements.join('\n')}\n`,
    'config.py': `CONFIG = {\n${s.hparams.map(h => `    "${key(h.name)}": ${/^[\d.e-]+$/.test(h.value) ? h.value : JSON.stringify(h.value)},${h.evidence ? '' : '  # ASSUMPTION: chosen by you'}`).join('\n')}${s.hparams.length ? '\n' : ''}    "datasets": ${JSON.stringify(s.datasets)},\n    "seed": 0,\n    "smoke_examples": 32,\n}\n`,
    'data.py': `from datasets import load_dataset\n\n\ndef load(split, limit=None):\n    """Load ${s.datasets[0] || 'the evaluation data'}. Check per-split counts against the paper."""\n    # TODO: replace with the exact dataset id and preprocessing from the paper\n    ds = load_dataset(${JSON.stringify((s.datasets[0] || 'DATASET').toLowerCase())}, split=split)\n    return ds.select(range(min(limit, len(ds)))) if limit else ds\n`,
    'method.py': comps.map(c => `class ${cls(c)}:\n    """${c}"""\n\n    def __init__(self, config):\n        self.config = config\n\n    def __call__(self, x):\n        # TODO: implement ${c} as described in the paper\n        raise NotImplementedError("${c}")\n`).join('\n\n') + `\n\ndef build(config):\n    return [${comps.map(c => `${cls(c)}(config)`).join(', ')}]\n`,
    'evaluate.py': `def evaluate(predictions, references):\n    """Compute ${metrics.join(', ') || 'the paper\'s metrics'} exactly as the paper does."""\n    # TODO: implement each metric\n    return {${metrics.map(m => `${JSON.stringify(m)}: None`).join(', ')}}\n`,
    'run.py': `import argparse, json, random\nfrom config import CONFIG\nfrom data import load\nfrom method import build\nfrom evaluate import evaluate\n\n\ndef main():\n    ap = argparse.ArgumentParser()\n    ap.add_argument("--smoke", action="store_true", help="tiny end-to-end run")\n    args = ap.parse_args()\n    random.seed(CONFIG["seed"])\n    data = load("test", CONFIG["smoke_examples"] if args.smoke else None)\n    pipeline = build(CONFIG)\n    predictions = []\n    for example in data:\n        x = example\n        for stage in pipeline:\n            x = stage(x)\n        predictions.append(x)\n    results = evaluate(predictions, data)\n    print("${MARK}", json.dumps(results))\n\n\nif __name__ == "__main__":\n    main()\n`,
  }
  return { plan, files, local: true }
}

// A Colab notebook that writes every file, installs, runs the smoke test, then the full run.
export function toNotebook(project, raw) {
  const build = normBuild(raw)
  const md = text => ({ cell_type: 'markdown', metadata: {}, source: text })
  const code = text => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: text })
  const dirs = [...new Set(Object.keys(build.files).map(p => p.split('/').slice(0, -1).join('/')).filter(Boolean))]
  return JSON.stringify({
    nbformat: 4, nbformat_minor: 5,
    metadata: { accelerator: 'GPU', colab: { provenance: [], gpuType: 'T4' }, kernelspec: { name: 'python3', display_name: 'Python 3' } },
    cells: [
      md(`# ${project.title}\nGenerated by **AI Research OS · Reproduce Lab**. Runtime → Change runtime type → **T4 GPU**, then Runtime → Run all.\n\nWhen it finishes, copy the \`${MARK}\` line into the Lab's scorecard.`),
      code('!nvidia-smi -L || echo "No GPU: the smoke test still runs on CPU"'),
      ...(dirs.length ? [code(dirs.map(d => `!mkdir -p ${d}`).join('\n'))] : []),
      ...Object.entries(build.files).map(([p, c]) => code(`%%writefile ${p}\n${c}`)),
      code('!pip install -q -r requirements.txt'),
      md('## Smoke test\nA tiny end-to-end run to catch bugs in under 3 minutes.'),
      code('!python run.py --smoke'),
      md('## Full experiment'),
      code('!python run.py'),
    ],
  }, null, 1)
}

// Minimal ZIP writer (stored, no compression) so downloads need no dependency.
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = b => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0 }
export function zip(raw, root = 'project') {
  const files = Object.fromEntries(Object.entries(raw).filter(([p]) => safePath(p)))
  const enc = new TextEncoder(), parts = [], central = []
  let off = 0
  for (const [path, text] of Object.entries(files)) {
    const name = enc.encode(`${root}/${path}`), data = enc.encode(text), crc = crc32(data)
    const head = new DataView(new ArrayBuffer(30))
    ;[[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2]].forEach(([o, v, n]) => n === 4 ? head.setUint32(o, v, true) : head.setUint16(o, v, true))
    const cen = new DataView(new ArrayBuffer(46))
    ;[[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [42, off, 4]].forEach(([o, v, n]) => n === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true))
    parts.push(head, name, data); central.push(cen, name)
    off += 30 + name.length + data.length
  }
  const size = central.reduce((n, x) => n + x.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  ;[[0, 0x06054b50, 4], [8, central.length / 2, 2], [10, central.length / 2, 2], [12, size, 4], [16, off, 4]].forEach(([o, v, n]) => n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true))
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

// Static check in the browser with Pyodide: every .py file must parse, and every import of a local
// module must name something that module defines. Catches most generation bugs before a GPU run.
let pyodide
export async function checkCode(files) {
  if (!pyodide) {
    if (!window.loadPyodide) await new Promise((ok, fail) => { const s = Object.assign(document.createElement('script'), { src: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js', onload: ok, onerror: () => fail(new Error('Could not load Python (Pyodide) from the CDN')) }); document.head.appendChild(s) })
    pyodide = await window.loadPyodide()
  }
  pyodide.globals.set('FILES', pyodide.toPy(Object.fromEntries(Object.entries(files).filter(([p]) => p.endsWith('.py')))))
  const out = pyodide.runPython(`
import ast, json
mods = {p[:-3].replace('/', '.'): src for p, src in FILES.items()}
defs, problems = {}, {}
for p, src in FILES.items():
    try:
        t = ast.parse(src, p)
        names = set()
        for n in t.body:
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)): names.add(n.name)
            elif isinstance(n, ast.Assign): names.update(x.id for x in n.targets if isinstance(x, ast.Name))
            elif isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name): names.add(n.target.id)
            elif isinstance(n, (ast.Import, ast.ImportFrom)): names.update((a.asname or a.name).split('.')[0] for a in n.names)
        defs[p[:-3].replace('/', '.')] = (t, names)
    except SyntaxError as e:
        problems.setdefault(p, []).append(f"SyntaxError line {e.lineno}: {e.msg}")
for mod, (t, _) in defs.items():
    p = mod.replace('.', '/') + '.py'
    for n in ast.walk(t):
        if isinstance(n, ast.ImportFrom) and n.module in defs and n.level == 0:
            for a in n.names:
                if a.name != '*' and a.name not in defs[n.module][1]:
                    problems.setdefault(p, []).append(f"line {n.lineno}: imports {a.name} from {n.module}, which does not define it")
if 'run.py' in FILES and '${MARK}' not in FILES['run.py']:
    problems.setdefault('run.py', []).append("never prints the ${MARK} line, so results cannot be imported")
json.dumps(problems)
`)
  return JSON.parse(out)
}

// Pulls metric values out of pasted run output ("RESULTS_JSON: {...}" or any JSON object).
export function parseResults(text) {
  const line = text.split('\n').reverse().find(l => l.includes(MARK)) || text
  try {
    const o = json(line.slice(line.indexOf(MARK) >= 0 ? line.indexOf(MARK) + MARK.length : 0))
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v))).map(([k, v]) => [k, String(v)]))
  } catch { return {} }
}
