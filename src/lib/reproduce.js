// Reproduce Lab: turns a paper (or a raw idea) into a reproduction spec, a step-by-step plan, a code
// scaffold and a mentor. Claude fills it in when a key is set; otherwise everything below runs locally
// by mining the paper text for datasets, hyperparameters, metrics, compute and code links.
import { passages, search } from './nlp.js'

const DATASETS = ['ImageNet', 'CIFAR-10', 'CIFAR-100', 'MNIST', 'COCO', 'Pascal VOC', 'SQuAD', 'GLUE', 'SuperGLUE', 'MMLU', 'GSM8K', 'MATH', 'HumanEval', 'MBPP', 'BBH', 'BIG-Bench', 'HellaSwag', 'ARC', 'TruthfulQA', 'WikiText', 'C4', 'The Pile', 'LibriSpeech', 'HotpotQA', 'Natural Questions', 'TriviaQA', 'MS MARCO', 'BEIR', 'ALFWorld', 'WebShop', 'ToolBench', 'LongBench', 'NarrativeQA', 'QuALITY', 'Multi-Session Chat', 'LoCoMo', 'StrategyQA', 'CommonsenseQA', 'WMT', 'CNN/DailyMail', 'XSum', 'AlpacaEval', 'MT-Bench', 'SWE-bench', 'HotPotQA', 'FEVER', 'Spider', 'WebArena', 'Minecraft']
const MODELS = ['GPT-4o', 'GPT-4', 'GPT-3.5', 'GPT-3', 'ChatGPT', 'Claude', 'LLaMA', 'Llama 2', 'Llama 3', 'Mistral', 'Mixtral', 'PaLM', 'Gemini', 'T5', 'Flan-T5', 'BERT', 'RoBERTa', 'Vicuna', 'Qwen', 'ResNet-50', 'ResNet', 'ViT', 'CLIP', 'text-davinci-003', 'Codex']
const METRICS = ['accuracy', 'exact match', 'EM', 'F1', 'BLEU', 'ROUGE-L', 'ROUGE', 'perplexity', 'pass@1', 'pass@k', 'success rate', 'win rate', 'mAP', 'AUC', 'recall@k', 'nDCG', 'MRR', 'top-1', 'compression ratio', 'latency', 'speedup']
const HP = [
  ['Learning rate', /(?:learning rate|\blr\b)\s*(?:of|=|:|is|was|to|set to)?\s*([0-9.]+(?:\s*[×x*]\s*10\s*[-−]\s*\d+|e-?\d+)?)/i],
  ['Batch size', /batch size\s*(?:of|=|:|is|was|to)?\s*(\d[\d,]*)/i],
  ['Epochs', /(\d+)\s*(?:training\s*)?epochs/i],
  ['Training steps', /(\d[\d,.]*\s*[kKM]?)\s*(?:training\s*|gradient\s*)?(?:steps|iterations)\b/i],
  ['Optimizer', /\b(AdamW|Adam|SGD|Adafactor|RMSprop|LAMB|Lion)\b/],
  ['Weight decay', /weight decay\s*(?:of|=|:|is)?\s*([0-9.]+(?:e-?\d+)?)/i],
  ['Warmup', /warm-?up\s*(?:of|for|=)?\s*(\d[\d,]*\s*(?:steps|epochs|%)?)/i],
  ['Dropout', /dropout\s*(?:rate|probability)?\s*(?:of|=|:|is)?\s*(0?\.\d+)/i],
  ['Temperature', /temperature\s*(?:of|=|:|is|to|set to)?\s*([0-9.]+)/i],
  ['Top-k / retrieval k', /top-?k\s*(?:=|of|:)?\s*(\d+)/i],
  ['Context length', /(\d[\d,]*\s*[kK]?)[- ](?:token)?\s*context/i],
  ['Seeds / runs', /(\d+)\s*(?:random\s*|different\s*)?(?:seeds|runs|trials)\b/i],
]

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sentencesOf = text => (text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z(])/)
const around = (text, i, n = 90) => `…${text.slice(Math.max(0, i - n), i + n).replace(/\s+/g, ' ').trim()}…`
const uniq = a => [...new Set(a.filter(Boolean))]
// Coerces a spec from storage or the sync server to the shapes the Lab renders.
export function normSpec(x = {}) {
  const list = v => (Array.isArray(v) ? v : [])
  const txt = v => (typeof v === 'string' ? v : '')
  return {
    ...x, summary: txt(x.summary), compute: isFiller(x.compute) ? '' : txt(x.compute), baselines: isFiller(x.baselines) ? '' : txt(x.baselines), training: !!x.training,
    ...Object.fromEntries(['components', 'datasets', 'models'].map(k => [k, list(x[k]).map(String).filter(v => !isFiller(v))])),
    missing: list(x.missing).map(String),
    // Code links come from model output or a synced workspace: only plain https GitHub repo URLs are kept.
    code: list(x.code).map(String).filter(u => /^https:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(u)),
    hparams: list(x.hparams).filter(h => h && typeof h === 'object').map(h => isFiller(h.value) ? { name: txt(h.name), value: '', evidence: '' } : { name: txt(h.name), value: txt(h.value), evidence: txt(h.evidence) }),
    metrics: list(x.metrics).filter(m => m && typeof m === 'object').map(m => ({ name: txt(m.name), paper: txt(m.paper), mine: txt(m.mine) })),
    related: list(x.related).filter(r => r && typeof r.id === 'string'),
  }
}
export const rid = () => Math.random().toString(36).slice(2, 9)

const isTraining = text => /\b(fine-?tun|train(ed|ing)? (on|for|with)|pre-?train|gradient|optimi[sz]er|epochs?)\b/i.test(text)

// Everything we can learn about how to rebuild the paper, straight from its text.
export function extractSpec(paper) {
  const text = [paper.body && paper.body.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2').replace(/[ \t]+([,.;:)])/g, '$1'), paper.abstract, paper.method && `Method: ${paper.method}.`, paper.dataset && `Datasets: ${paper.dataset}.`].filter(Boolean).join('\n')
  // Dataset and model names are proper nouns, so match them case-sensitively ("QuALITY" ≠ "quality").
  const has = (name, flags = '') => new RegExp(`(^|[^\\w-])${esc(name)}(?![\\w-]|\\.\\d)`, flags).test(text)
  const datasets = uniq([...(paper.dataset ? paper.dataset.split(/,\s*/) : []), ...DATASETS.filter(n => has(n))]).slice(0, 8)
  const models = uniq(MODELS.filter(n => has(n))).slice(0, 6)
  const hparams = HP.map(([name, re]) => { const m = text.match(re); return m && { name, value: m[1].trim(), evidence: around(text, m.index) } }).filter(Boolean)
  const metrics = METRICS.filter(n => has(n, n.length < 4 ? '' : 'i')).slice(0, 6).map(name => {
    const m = text.match(new RegExp(`(\\d{1,3}(?:\\.\\d+)?)\\s*%?\\s*(?:\\w+\\s){0,3}?${esc(name)}|${esc(name)}\\s*(?:of|=|:|is|to|reaches|by)?\\s*(\\d{1,3}(?:\\.\\d+)?)`, name.length < 4 ? '' : 'i'))
    return { name, paper: m ? m[1] || m[2] : '', mine: '' }
  })
  const gpu = text.match(/(\d+\s*[×x]?\s*)?(?:NVIDIA\s*)?(A100|H100|V100|P100|K80|A6000|A10G|RTX\s?\d{4}|TPU\s?v\d|\bT4\b)\s*(?:GPUs?)?/)
  const hours = text.match(/(\d[\d,.]*)\s*(GPU[- ]hours|hours|days)/i)
  const compute = [gpu && gpu[0].trim(), hours && hours[0]].filter(Boolean).join(', ')
  const code = uniq((text.match(/https:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/g) || []).map(u => u.replace(/[.)]+$/, ''))).slice(0, 4)
  const core = sentencesOf(text).filter(s => /\b(we (propose|introduce|present|design)|our (method|approach|framework|system)|consists of|is composed of)\b/i.test(s) && s.length < 400).slice(0, 3)
  const components = uniq((paper.method || '').split(/,|\+|;| and | with /i).map(s => s.trim()).filter(s => s.length > 2)).slice(0, 5)
  const base = text.match(/(?:compar(?:e|ed|ing) (?:it |our method |our approach )?(?:to|with|against)|baselines? (?:include|such as|are)?:?)\s+([^.]{5,140})/i)
  const training = isTraining(text)
  const need = training ? ['Learning rate', 'Batch size', 'Optimizer', 'Epochs', 'Seeds / runs'] : ['Temperature', 'Seeds / runs']
  const missing = [
    ...need.filter(n => !hparams.some(h => h.name === n || (n === 'Epochs' && h.name === 'Training steps'))).map(n => `${n} is not stated — pick a sensible default and record it as a deviation.`),
    !training && !models.length && 'Base model not named — check the experimental setup section or appendix.',
    !datasets.length && 'No dataset found — check the evaluation section.',
    !code.length && 'No official code link in the text — search GitHub / Papers with Code for the title.',
    !training && 'Prompt templates are rarely in the main text — look in the appendix.',
  ].filter(Boolean)
  return {
    summary: core.join(' ') || paper.abstract?.slice(0, 400) || '', components, datasets, models, hparams,
    metrics: metrics.length ? metrics : [{ name: 'main metric', paper: '', mine: '' }], compute, code,
    baselines: base && /[A-Z]/.test(base[1]) ? base[1].trim() : '', missing, training,
  }
}

const step = (title, detail, hint = '', check = '') => ({ id: rid(), title, detail, hint, check, done: false, note: '' })

export function planForPaper(paper, spec) {
  const short = paper.title.split(':')[0]
  return [
    step('Map the method', `Re-read the method section of ${short} and write its core idea in two sentences, in your own words.`,
      spec.summary ? `The paper describes itself as: “${spec.summary.slice(0, 300)}”` : 'Look for “we propose…” in the introduction and the first figure.',
      'Could you explain the method to a colleague without the paper open?'),
    step('Find existing code', spec.code.length ? `Official code: ${spec.code.join(', ')}. Clone it and run its smallest example before writing anything.` : 'No code link was found. Search GitHub and Papers with Code for the title; an unofficial implementation is still a useful reference.',
      'Pin the exact commit you use, and note any differences between the code and the paper.', 'Does the reference code run end to end on a toy input?'),
    step('Set up environment & compute', spec.compute ? `The paper reports ${spec.compute}. Plan a scaled-down run that fits your hardware first.` : 'The paper does not state its compute. Start with the smallest model and a data subset.',
      'Use a fresh virtualenv, pin library versions, and set a global seed.', 'Can you train or run one batch without errors?'),
    step('Get the data', spec.datasets.length ? `Download ${spec.datasets.join(', ')}. Check the splits, sizes and preprocessing against the paper.` : 'Identify the evaluation data from the experiments section.',
      spec.datasets.length ? `Most are on Hugging Face: datasets.load_dataset("${spec.datasets[0].toLowerCase()}"). Count examples per split and compare with the paper.` : '',
      'Do your example counts per split match the paper?'),
    step('Reproduce a baseline first', spec.baselines ? `The paper compares against ${spec.baselines}. Reproduce the simplest one first.` : 'Reproduce the simplest baseline in the results table first.',
      'If your baseline number matches the paper, your data and evaluation pipeline are probably right. Do this before touching the new method.', 'Is your baseline within ~1–2 points of the reported number?'),
    ...(spec.components.length ? spec.components : ['the core method']).map(c => step(`Implement: ${c}`, `Build “${c}” as an isolated module with a unit test on a tiny hand-made input.`,
      paper.body ? passages(paper.body, c, 1, 500)[0]?.slice(0, 320) || '' : '', `Does “${c}” behave as the paper describes on a case you can check by hand?`)),
    step('Sanity check at small scale', 'Run end to end on ~1% of the data. For training, make sure it can overfit a single batch. For prompting, read 10 outputs by hand.',
      'Bugs are cheapest to find here: loss that never falls, empty retrievals, prompts cut off at the token limit.', 'Does the small run behave sensibly?'),
    step('Full run with the paper’s settings', spec.hparams.length ? `Use ${spec.hparams.map(h => `${h.name.toLowerCase()} ${h.value}`).join(', ')}.` : 'Use the settings from the experiments section and appendix.',
      spec.missing.length ? `Unstated in the paper: ${spec.missing.slice(0, 3).join(' ')}` : '', 'Did you log every setting you had to choose yourself?'),
    step('Compare against the paper', 'Fill in your numbers in the scorecard. Within ~2% relative counts as reproduced.',
      'If you are lower, check in this order: evaluation script, preprocessing, model version, decoding settings, then seeds (run 3).', 'Which numbers match, and which do not?'),
    step('Ablate', 'Remove one component at a time and see whether the drop matches the paper’s ablation table.',
      'This shows which parts really matter, which is often the most useful thing a reproduction finds.', 'Which component contributes the most?'),
    step('Write it up', 'Record the results, every deviation from the paper and what was unclear. Save the key insights to your Notebook.',
      'A short “reproducibility report” (setup, deviations, results, lessons) makes a strong blog post or workshop paper.', 'Could someone rerun your setup from your notes alone?'),
  ]
}

// An idea has no paper to copy, so the spec is borrowed from the closest papers in the library.
export function specForIdea(idea, papers, index) {
  const related = search(index, idea, 6).slice(0, 5)
  const rel = related.map(r => r.paper)
  return {
    summary: idea, components: [], related: related.map(r => ({ id: r.paper.id, title: r.paper.title, match: r.match })),
    datasets: uniq(rel.flatMap(p => (p.dataset || '').split(/,\s*/))).slice(0, 6),
    models: [], hparams: [], code: [], compute: '', baselines: rel.slice(0, 2).map(p => `${p.title.split(':')[0]} (${p.method || 'their method'})`).join('; '),
    metrics: [{ name: 'primary metric', paper: '', mine: '' }],
    missing: rel.filter(p => p.limitation).slice(0, 3).map(p => `Risk from ${p.title.split(':')[0]}: ${p.limitation}.`),
    training: false,
  }
}

export function planForIdea(idea, spec) {
  const rel = spec.related || []
  return [
    step('Sharpen the hypothesis', `Rewrite “${idea.slice(0, 160)}” as: If we <change>, then <metric> on <dataset> improves by ≥ <N> over <baseline>.`,
      'A good hypothesis can be proven wrong by a single experiment. If you can’t name the metric, the idea isn’t ready yet.', 'Could one experiment prove it wrong?'),
    step('Check prior work', rel.length ? `Closest papers in your library: ${rel.map(r => `${r.title.split(':')[0]} (${r.match}%)`).join(', ')}. Read their limitations; your idea should address one.` : 'Search arXiv for the core terms; add the five closest papers to your library.',
      'Use the Citations tab on the closest paper to see who has already extended it.', 'What does your idea do that the closest paper does not?'),
    step('Pick the baseline', spec.baselines ? `Start from ${spec.baselines}.` : 'Choose the strongest simple method your idea improves on.',
      'Reproducing the baseline (use this Lab on that paper) gives you a trustworthy pipeline to build on.', 'Can you run the baseline and get its reported number?'),
    step('Choose data and metric', spec.datasets.length ? `Related work evaluates on ${spec.datasets.join(', ')}. Reusing one makes your results comparable.` : 'Pick a public benchmark so results are comparable.',
      'Prefer one small, fast benchmark for iteration and one standard benchmark for the final result.', 'Is the metric what your hypothesis is about?'),
    step('Design the minimal experiment', 'Find the smallest version of the idea that could fail within a day: small model, data subset, one change.',
      'Write down the result you expect before you run it. That keeps you honest.', 'What result would make you drop the idea?'),
    step('Build it', 'Implement the change on top of the baseline with a flag to switch it off, so every run is a clean A/B comparison.',
      'Keep the change small and switchable; one config flag per idea component.', 'Does turning the flag off reproduce the baseline exactly?'),
    step('Run and compare', 'Run the baseline and your variant with the same seeds (at least 3) and record both in the scorecard.',
      'Report the mean and spread. A gain smaller than the seed-to-seed variance is not a gain.', 'Is the improvement larger than the noise?'),
    step('Stress-test', 'Ablate each part, try a second dataset and look at failure cases.',
      spec.missing.length ? spec.missing.join(' ') : 'Look for the cases where your method is worse than the baseline.', 'Where does it break?'),
    step('Decide', 'Scale up, pivot, or write it up. Save the outcome as a hypothesis note either way.',
      'Negative results are worth writing down; they stop you or a teammate trying the same thing again.', 'What is the next experiment?'),
  ]
}

export function specPrompt(paper) {
  const ctx = paper.body ? ['method', 'experiment setup hyperparameters learning rate batch', 'results table accuracy', 'dataset benchmark evaluation', 'implementation details appendix'].flatMap(q => passages(paper.body, q, 2, 900)) : []
  return `You are helping a researcher reproduce this paper: "${paper.title}" (${paper.year}).
Abstract: ${paper.abstract}
${ctx.length ? `Excerpts from the full text:\n${uniq(ctx).slice(0, 8).map(c => `> ${c}`).join('\n')}` : ''}

Respond ONLY with JSON:
{"summary": "core idea in 2-3 sentences", "components": ["module to implement", ...], "datasets": [...], "models": [...],
 "hparams": [{"name": "...", "value": "...", "evidence": "short quote"}], "metrics": [{"name": "...", "paper": "reported value"}],
 "compute": "...", "code": ["github urls if stated"], "baselines": "...", "missing": ["detail the paper does not state, and what to assume"],
 "steps": [{"title": "...", "detail": "what to do", "hint": "concrete tip, library or pitfall", "check": "question to verify the step"}]}
Use 8-12 steps: understand the method, code, environment, data, baseline first, one step per component, small-scale sanity check, full run, compare, ablate, write up. Only state values the text supports; put everything else in "missing".`
}

export function ideaPrompt(idea, related) {
  return `A researcher wants to turn this idea into a real project: "${idea}"
Closest papers in their library:
${related.map((p, i) => `[${i + 1}] ${p.title} (${p.year}) — method: ${p.method || '-'}; datasets: ${p.dataset || '-'}; limitation: ${p.limitation || '-'}`).join('\n')}

Respond ONLY with JSON:
{"summary": "the idea as a falsifiable hypothesis", "components": ["what has to be built"], "datasets": [...], "baselines": "...",
 "metrics": [{"name": "...", "paper": "baseline value if known"}], "missing": ["key risks and open questions"],
 "steps": [{"title": "...", "detail": "what to do", "hint": "concrete tip", "check": "question to verify the step"}]}
Use 8-10 steps from sharpening the hypothesis to a minimal experiment that could fail fast, then scaling. Be concrete and cite the papers as [n].`
}

// Merges model JSON over the local spec so a partial answer still leaves a full project.
// Models often fill unknowns with "Not mentioned in the abstract", "unspecified" and the like: those are gaps, not values.
const FILLER = /^\s*(not\s+(explicitly\s+|clearly\s+)?(mentioned|specified|stated|given|reported|provided|described|available)|unspecified|unknown|n\/?a|none( given| specified)?|tbd|-+)\b/i
export const isFiller = v => !String(v ?? '').trim() || FILLER.test(String(v))

export function parseAI(out, spec, steps) {
  try {
    const j = JSON.parse(out.match(/\{[\s\S]*\}/)[0])
    const list = v => (Array.isArray(v) ? v : [])
    const gaps = []
    for (const k of ['datasets', 'models', 'compute', 'baselines']) {
      const v = j[k], bad = Array.isArray(v) ? v.length > 0 && v.every(isFiller) : typeof v === 'string' && isFiller(v)
      if (bad) gaps.push(`${k[0].toUpperCase() + k.slice(1)} are not stated in the paper text available`)
      if (Array.isArray(v)) j[k] = v.filter(x => !isFiller(x)); else if (typeof v === 'string' && isFiller(v)) delete j[k]
    }
    if (Array.isArray(j.hparams)) j.hparams = j.hparams.map(h => h && isFiller(h.value) ? (gaps.push(`No value given for ${h.name || 'a setting'}: choose one and record it`), { ...h, value: '', evidence: '' }) : h)
    if (gaps.length) j.missing = [...new Set([...list(j.missing).map(String), ...gaps])]
    const s = {
      ...spec,
      ...Object.fromEntries(['summary', 'compute', 'baselines'].filter(k => typeof j[k] === 'string' && j[k]).map(k => [k, j[k]])),
      ...Object.fromEntries(['components', 'datasets', 'models', 'code', 'missing'].filter(k => list(j[k]).length).map(k => [k, list(j[k]).map(String)])),
      hparams: list(j.hparams).length ? list(j.hparams).map(h => ({ name: String(h.name || ''), value: String(h.value || ''), evidence: String(h.evidence || '') })) : spec.hparams,
      metrics: list(j.metrics).length ? list(j.metrics).map(m => ({ name: String(m.name || ''), paper: String(m.paper || ''), mine: '' })) : spec.metrics,
    }
    const st = list(j.steps).filter(x => x?.title).map(x => step(String(x.title), String(x.detail || ''), String(x.hint || ''), String(x.check || '')))
    return { spec: s, steps: st.length >= 3 ? st : steps }
  } catch { return { spec, steps } }
}

// Spec text comes from PDFs, model output or a teammate's synced workspace. Before it goes into
// generated Python (comments, docstrings, string literals), drop newlines, quotes and backslashes so a
// value can never close a string or start a new line of code.
export const pyText = v => String(v ?? '').replace(/[\r\n\u2028\u2029\\"']+/g, ' ').trim()
export const pySafe = s => ({
  ...s, summary: pyText(s.summary),
  ...Object.fromEntries(['components', 'datasets', 'code', 'missing'].map(k => [k, s[k].map(pyText)])),
  hparams: s.hparams.map(h => ({ ...h, name: pyText(h.name) })),
  metrics: s.metrics.map(m => ({ ...m, name: pyText(m.name), paper: pyText(m.paper) })),
})

// A runnable-shaped skeleton: config from the spec, one class per component, train/eval loops.
export function scaffold(project) {
  const s = pySafe(project.spec), title = pyText(project.title)
  const cls = c => c.replace(/[^\w ]/g, ' ').trim().split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join('').slice(0, 40) || 'Component'
  const comps = s.components.length ? s.components : ['Core method']
  const cfg = [...s.hparams.map(h => `    "${h.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_$/, '')}": ${/^[\d.e-]+$/.test(h.value) ? h.value : JSON.stringify(h.value)},  # ${h.evidence ? 'from paper' : 'set by you'}`),
    ...s.missing.filter(m => / is not stated/.test(m)).map(m => `    "${m.split(' is not')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_')}": None,  # TODO not stated in the paper`)]
  return `"""Reproduction scaffold for: ${title}
Generated by AI Research OS · Reproduce Lab. Fill in the TODOs step by step.
${s.code.length ? `Reference code: ${s.code.join(', ')}\n` : ''}"""
import random, json
import numpy as np
${s.training ? 'import torch\nimport torch.nn as nn\n' : ''}
CONFIG = {
${cfg.join('\n') || '    # add hyperparameters here'}
    "seed": 0,
    "datasets": ${JSON.stringify(s.datasets)},
}


def set_seed(seed):
    random.seed(seed); np.random.seed(seed)
${s.training ? '    torch.manual_seed(seed)\n' : ''}

def load_data(split):
    # TODO: ${s.datasets.length ? `load ${s.datasets[0]} (e.g. datasets.load_dataset)` : 'load the evaluation data'}; check counts per split against the paper
    raise NotImplementedError

${comps.map(c => `
class ${cls(c)}${s.training ? '(nn.Module)' : ''}:
    """${c}"""
    def __init__(self, config):
${s.training ? '        super().__init__()\n' : ''}        self.config = config
        # TODO: build ${c}

    def ${s.training ? 'forward' : '__call__'}(self, x):
        # TODO: implement ${c} as described in the paper
        raise NotImplementedError
`).join('\n')}

def run(config, split="test"):
    set_seed(config["seed"])
    data = load_data(split)
    pipeline = [${comps.map(c => `${cls(c)}(config)`).join(', ')}]
    predictions = []
    for example in data:
        x = example
        for stage in pipeline:
            x = stage(x)
        predictions.append(x)
    return predictions


def evaluate(predictions, data):
    # TODO: compute ${s.metrics.map(m => m.name).join(', ') || 'the paper\'s metrics'} exactly as the paper does
    return {${s.metrics.map(m => `"${m.name}": None`).join(', ')}}


if __name__ == "__main__":
    results = [evaluate(run({**CONFIG, "seed": seed}), load_data("test")) for seed in range(3)]
    print(json.dumps(results, indent=2))
    # Paper reports: ${s.metrics.filter(m => m.paper).map(m => `${m.name}=${m.paper}`).join(', ') || 'see results table'}
`
}

export function planMarkdown(project) {
  const s = project.spec
  const done = project.steps.filter(x => x.done).length
  return [`# ${project.title}`, `${project.source.type === 'paper' ? 'Reproduction' : 'Idea'} plan · ${done}/${project.steps.length} steps done`, '', '## Core idea', s.summary, '',
    s.datasets.length && `**Datasets:** ${s.datasets.join(', ')}`, s.models?.length && `**Models:** ${s.models.join(', ')}`, s.compute && `**Compute:** ${s.compute}`, s.code.length && `**Code:** ${s.code.join(', ')}`, '',
    s.hparams.length && ['## Settings', '| Setting | Value |', '|---|---|', ...s.hparams.map(h => `| ${h.name} | ${h.value} |`), ''].join('\n'),
    s.missing.length && ['## Not stated / risks', ...s.missing.map(m => `- ${m}`), ''].join('\n'),
    '## Steps', ...project.steps.map((x, i) => `${i + 1}. [${x.done ? 'x' : ' '}] **${x.title}** — ${x.detail}${x.note ? `\n   - Notes: ${x.note}` : ''}`), '',
    '## Scorecard', '| Metric | Paper | Mine | Δ |', '|---|---|---|---|', ...s.metrics.map(m => `| ${m.name} | ${m.paper || '-'} | ${m.mine || '-'} | ${delta(m) ?? '-'} |`),
  ].filter(x => typeof x === 'string').join('\n')
}

export function delta(m) {
  const a = parseFloat(m.paper), b = parseFloat(m.mine)
  return Number.isFinite(a) && Number.isFinite(b) ? +(b - a).toFixed(2) : null
}
// Within 2% relative (or 0.5 absolute for small numbers) counts as reproduced.
export const verdict = m => { const d = delta(m), a = parseFloat(m.paper); return d == null ? '' : Math.abs(d) <= Math.max(0.5, Math.abs(a) * 0.02) ? 'match' : d > 0 ? 'above' : 'below' }

const TROUBLE = [
  [/nan|inf|diverg|explod/i, 'Loss is NaN or diverging: lower the learning rate 3–10×, add gradient clipping (1.0), check for log(0) or division by zero, and try fp32 if you use fp16.'],
  [/out of memory|oom|cuda memory/i, 'Out of memory: halve the batch size and use gradient accumulation to keep the effective batch the same; turn on mixed precision and gradient checkpointing.'],
  [/lower|worse|gap|can'?t match|below|not match/i, 'Numbers below the paper: first check the evaluation script (normalisation, exact match vs F1), then preprocessing and tokenisation, the exact model or checkpoint, decoding settings (temperature, max tokens), and finally seeds. Average 3 runs.'],
  [/slow|time|hours|speed/i, 'Too slow: iterate on 1–5% of the data, cache preprocessing and embeddings, use mixed precision, and only run the full set for final numbers.'],
  [/loss (is )?(flat|not (decreas|going down))|not learning|stuck/i, 'Loss not going down: make sure the model can overfit one batch; check that labels line up with inputs, that the optimizer has the parameters, and the learning-rate schedule (warmup to 0?).'],
  [/prompt|format|parse|output/i, 'Prompt or output problems: print 10 raw outputs, check the prompt is not truncated, add a few-shot example in exactly the expected format, and parse leniently.'],
  [/data|download|split|dataset/i, 'Data issues: compare example counts per split with the paper, check for a different dataset version, and look for preprocessing details in the appendix.'],
]

// Local mentor: troubleshooting rules plus the passages of the paper most related to the question.
export function localMentor({ question, project, paper }) {
  const cur = project.steps.find(x => !x.done) || project.steps.at(-1)
  const out = []
  const tips = TROUBLE.filter(([re]) => re.test(question)).map(([, t]) => t)
  if (tips.length) out.push('## Try this', ...tips.map(t => `- ${t}`))
  if (cur) out.push(`## For your current step: ${cur.title}`, `- ${cur.detail}`, cur.hint && `- Tip: ${cur.hint}`)
  const ps = paper?.body ? passages(paper.body, `${question} ${cur?.title || ''}`, 2, 500) : []
  if (ps.length) out.push('## What the paper says', ...ps.map(p => `- …${p.slice(0, 320)}…`))
  const miss = project.spec.missing.filter(m => question.split(/\W+/).some(w => w.length > 3 && m.toLowerCase().includes(w.toLowerCase())))
  if (miss.length) out.push('## Known gaps in the paper', ...miss.map(m => `- ${m}`))
  if (!out.length) out.push('Describe what you ran and what you saw (error message, numbers). Add a Claude API key in Settings for a full mentor conversation.')
  return out.filter(Boolean).join('\n')
}

export function mentorPrompt({ question, project, paper, history }) {
  const cur = project.steps.find(x => !x.done)
  return `You are a hands-on research mentor helping someone ${project.source.type === 'paper' ? `reproduce "${project.title}"` : `turn an idea into an experiment: "${project.spec.summary}"`}.
Mode: ${project.mode === 'guide' ? 'GUIDE — teach. Ask one probing question, give hints and pointers, and do not hand over full solutions unless asked.' : 'PLAN — be direct: give concrete steps, commands and code.'}
Spec: ${JSON.stringify({ ...project.spec, related: undefined })}
Progress: ${project.steps.map(x => `${x.done ? '[x]' : '[ ]'} ${x.title}${x.note ? ` (notes: ${x.note})` : ''}`).join('; ')}
Current step: ${cur ? `${cur.title} — ${cur.detail}` : 'all done'}
${paper?.body ? `Relevant paper text:\n${passages(paper.body, question, 2, 700).map(p => `> ${p}`).join('\n')}` : ''}
Recent conversation:
${history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n')}

Question: ${question}
Answer in short Markdown.`
}
