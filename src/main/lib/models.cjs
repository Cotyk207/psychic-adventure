'use strict';

const MODELS_DATA = require('../../shared/models.json');
const PRESETS = require('../../shared/providers.json');

const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const REMOVED_PAID_BUILTIN_IDS = new Set([
  'openai',
  'anthropic',
  'deepseek',
  'xai',
  'moonshot',
]);

function prettifyModelId(modelId) {
  const raw = String(modelId || '').trim();
  if (!raw) return 'Модель';
  const base = raw
    .replace(/^@cf\/[^/]+\//, '')
    .replace(/^[^/]+\//, '')
    .replace(/:free$/i, ' Free')
    .replace(/-free$/i, ' Free');
  return base
    .split(/[-_]+/)
    .map((part) => {
      if (/^(gpt|vl|ai|llm|fp8|it)$/i.test(part)) return part.toUpperCase();
      if (/^v?\d+(\.\d+)*[a-z]?$/i.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function getModelMeta(providerId, modelId) {
  const id = String(modelId || '').trim();
  if (!id) {
    return {
      id: '',
      name: 'Выбрать модель',
      context: '',
      reasoning: false,
      toggle: false,
      vision: false,
      efforts: [],
    };
  }

  const exact = MODELS_DATA.exact[id];
  if (exact) {
    return {
      id,
      name: exact.name || prettifyModelId(id),
      context: exact.context || '128k',
      reasoning: Boolean(exact.reasoning),
      toggle: Boolean(exact.toggle),
      vision: Boolean(exact.vision),
      efforts: Array.isArray(exact.efforts) ? exact.efforts.slice() : [],
    };
  }

  const lower = id.toLowerCase();
  const isHybridReasoning = /qwen3|qwen-3|gemini-2\.5-flash|glm-4\.5/i.test(lower);
  const isPureReasoning = /deepseek-r1|reasoner|reasoning|qwq|\bo1\b|\bo3\b|\bo4\b|thinking|gemini-2\.5-pro/i.test(lower);
  const reasoning = isHybridReasoning || isPureReasoning;
  const vision = /gpt-4o|gpt-4\.1|\bo4\b|gemini|llava|\bvl\b|-vl-|_vl|pixtral|vision|gemma-?3|llama-4/i.test(lower);

  let efforts = [];
  if (isHybridReasoning) {
    efforts = ['none', 'low', 'medium', 'high', 'max'];
  } else if (isPureReasoning) {
    efforts = ['low', 'medium', 'high', 'max'];
  }

  let context = '128k';
  if (/gemini|llama-4-scout/i.test(lower)) context = '1M';
  else if (/\bo3\b|\bo4\b|200k/i.test(lower)) context = '200k';
  else if (/qwq|distill|32b/i.test(lower)) context = '64k';
  else if (/7b|8b|9b/i.test(lower)) context = '32k';

  return {
    id,
    name: prettifyModelId(id),
    context,
    reasoning,
    toggle: isHybridReasoning,
    vision,
    efforts,
  };
}

function resolveEffortForModel(metaOrProvider, modelOrPreferred = 'medium', maybePreferred = 'medium') {
  const meta =
    metaOrProvider && typeof metaOrProvider === 'object'
      ? metaOrProvider
      : getModelMeta(metaOrProvider, modelOrPreferred);
  const preferred =
    metaOrProvider && typeof metaOrProvider === 'object'
      ? modelOrPreferred
      : maybePreferred;

  const available = meta?.efforts || [];
  if (!available.length) return null;
  if (available.includes(preferred)) return preferred;
  const targetIdx = Math.max(0, EFFORT_ORDER.indexOf(preferred));
  let best = available[0];
  let bestDist = Infinity;
  for (const cand of available) {
    const idx = EFFORT_ORDER.indexOf(cand);
    const dist = Math.abs(idx - targetIdx);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return best;
}

function getEffortSpec(effort) {
  if (!effort) return null;
  return MODELS_DATA.efforts[effort] || null;
}

function filterFreeModels(providerOrId, models) {
  const providerId = typeof providerOrId === 'object' && providerOrId ? providerOrId.id : providerOrId;
  const list = Array.isArray(models) ? models : [];
  // Mixed-price catalogs must never expose paid models as free. BlockRun and
  // OVHcloud use a curated list; Kilo marks free models explicitly.
  if (providerId === 'kilo') {
    return list.filter((m) => String(m) === 'kilo-auto/free' || /:free$/i.test(String(m)));
  }
  if (providerId === 'blockrun' || providerId === 'ovhcloud' || providerId === 'vireonix') {
    const allowed = new Set(PRESETS.providers.find((p) => p.id === providerId)?.models || []);
    return list.filter((m) => allowed.has(String(m)));
  }
  if (providerId === 'openrouter') {
    return list.filter((m) => /:free$/i.test(String(m)) || String(m) === 'openrouter/free');
  }
  if (providerId === 'together') {
    return list.filter((m) => /-free$/i.test(String(m)) || /exaone/i.test(String(m)));
  }
  if (providerId === 'zhipu') {
    return list.filter((m) => /flash/i.test(String(m)));
  }
  if (providerId === 'opencode') {
    return list.filter((m) => {
      const s = String(m);
      if (/embed|bge-|jev-|decision|live|imagine|image/i.test(s)) return false;
      return /-free$/i.test(s) || s === 'big-pickle';
    });
  }
  if (providerId === 'pollinations') {
    const deprecatedClassic = new Set(['deepseek', 'deepseek-reasoning', 'llama', 'openai-reasoning']);
    return list.filter((m) => !deprecatedClassic.has(String(m).toLowerCase()));
  }
  return list;
}

module.exports = {
  MODELS_DATA,
  EFFORT_ORDER,
  REMOVED_PAID_BUILTIN_IDS,
  prettifyModelId,
  getModelMeta,
  resolveEffortForModel,
  getEffortSpec,
  filterFreeModels,
};
