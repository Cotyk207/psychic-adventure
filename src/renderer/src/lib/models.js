import MODELS_DATA from '@shared/models.json';

export const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export const EFFORT_META = MODELS_DATA.efforts;

export function prettifyModelId(modelId) {
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

export function getModelMeta(providerId, modelId) {
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

export function resolveEffortForModel(metaOrProvider, modelOrPreferred = 'medium', maybePreferred = 'medium') {
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

export function providerAccessGroup(provider) {
  if (!provider) return 'freekey';
  if (provider.accessType === 'nokey' || provider.accessType === 'local' || provider.noKey || provider.local) {
    return 'nokey';
  }
  return 'freekey';
}
