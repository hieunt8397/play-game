// Turns the DESIGN.md YAML front matter into typed token values (AD-8).
// Every string is parsed into structured fields; an unrecognised string fails the
// generator (except the few free-text description keys) so a DESIGN.md change can
// never slip into code as an opaque string.

export interface Color {
  css: string;
  value: number;
  alpha: number;
}

type TokenValue = number | string | boolean | Color | TokenValue[] | { [key: string]: TokenValue };
type TokenObject = { [key: string]: TokenValue };

/** Keys whose values are deliberately free text (descriptions, CSS font stacks). */
const FREE_TEXT_KEYS = new Set(['fontFamily', 'placement', 'shape']);

const GROUPS = ['colors', 'typography', 'rounded', 'spacing', 'components'] as const;
type Group = (typeof GROUPS)[number];
type RawDesign = Record<Group, Record<string, unknown>>;

export class TokenParseError extends Error {}

export function camelCase(key: string): string {
  return key.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

const num = (s: string): number => Number(s);
const ms = (seconds: string): number => Math.round(Number(seconds) * 1000);

function hexColor(hex: string, alpha = 1): Color {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new TokenParseError(`bad hex colour ${hex}`);
  return { css: hex.toUpperCase(), value: parseInt(hex.slice(1), 16), alpha };
}

function rgbaColor(text: string): Color {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(text);
  if (!m) throw new TokenParseError(`bad rgba colour ${text}`);
  const [r, g, b] = [num(m[1]!), num(m[2]!), num(m[3]!)];
  const alpha = m[4] === undefined ? 1 : num(m[4]);
  return { css: `rgba(${r},${g},${b},${alpha})`, value: (r << 16) | (g << 8) | b, alpha };
}

const withAlpha = (c: Color, alpha: number): Color => ({ ...c, alpha });

/** Splits on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  parts.push(current.trim());
  return parts;
}

const PX = '(-?\\d*\\.?\\d+)px';
const PXO = '(-?\\d*\\.?\\d+)(?:px)?';
const N = '(\\d*\\.?\\d+)';
const REF = '\\{([a-z]+)\\.([\\w-]+)\\}';

export function parseDesign(raw: unknown): TokenObject {
  if (!raw || typeof raw !== 'object') throw new TokenParseError('DESIGN.md has no YAML front matter');
  const design = raw as RawDesign;
  for (const g of GROUPS) {
    if (!design[g] || typeof design[g] !== 'object') throw new TokenParseError(`DESIGN.md front matter missing "${g}"`);
  }

  const resolved = new Map<string, TokenValue>();
  const resolving = new Set<string>();

  function resolveRef(group: string, key: string): TokenValue {
    const id = `${group}.${key}`;
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;
    if (resolving.has(id)) throw new TokenParseError(`circular token reference {${id}}`);
    const source = (design as Record<string, Record<string, unknown> | undefined>)[group]?.[key];
    if (source === undefined) throw new TokenParseError(`unknown token reference {${id}}`);
    resolving.add(id);
    const value = parseGroupEntry(group as Group, key, source);
    resolving.delete(id);
    resolved.set(id, value);
    return value;
  }

  function refColor(group: string, key: string): Color {
    const v = resolveRef(group, key);
    if (typeof v !== 'object' || Array.isArray(v) || !('css' in v)) {
      throw new TokenParseError(`{${group}.${key}} is not a colour`);
    }
    return v as unknown as Color;
  }

  function refNumber(group: string, key: string): number {
    const v = resolveRef(group, key);
    if (typeof v !== 'number') throw new TokenParseError(`{${group}.${key}} is not a number`);
    return v;
  }

  function shadowLayer(text: string): TokenObject {
    const m = new RegExp(`^(inset )?${PXO}\\s+${PXO}\\s+${PXO}\\s+(rgba?\\(.+\\))$`).exec(text);
    if (!m) throw new TokenParseError(`bad shadow layer "${text}"`);
    return {
      inset: Boolean(m[1]),
      x: num(m[2]!),
      y: num(m[3]!),
      blur: num(m[4]!),
      color: rgbaColor(m[5]!) as unknown as TokenValue,
    };
  }

  function parseString(key: string, s: string): TokenValue {
    let m: RegExpExecArray | null;
    // Whole-value reference: {group.key}
    if ((m = new RegExp(`^${REF}$`).exec(s))) return resolveRef(m[1]!, m[2]!);
    if ((m = new RegExp(`^${PX}$`).exec(s))) return num(m[1]!);
    if ((m = new RegExp(`^${N}$`).exec(s))) return num(m[1]!);
    if ((m = new RegExp(`^${PX}/s$`).exec(s))) return num(m[1]!);
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return hexColor(s) as unknown as TokenValue;
    if (/^rgba?\(.*\)$/.test(s)) return rgbaColor(s) as unknown as TokenValue;
    // Stroke: "6px {colors.x}", "3px {colors.x} 80%", "4px dashed {colors.x}"
    if ((m = new RegExp(`^${PX}(?: (dashed|solid))? ${REF}(?: ${N}%)?$`).exec(s))) {
      const color = refColor(m[3]!, m[4]!);
      const stroke: TokenObject = {
        width: num(m[1]!),
        color: (m[5] ? withAlpha(color, num(m[5]) / 100) : color) as unknown as TokenValue,
      };
      if (m[2]) stroke['style'] = m[2];
      return stroke;
    }
    // Pulse: "scale .95→1.05, 1.4s" (+ optional easing)
    if ((m = new RegExp(`^scale ${N}→${N}, ${N}s(?: ([a-z-]+))?$`).exec(s))) {
      const pulse: TokenObject = { from: num(m[1]!), to: num(m[2]!), durationMs: ms(m[3]!) };
      if (m[4]) pulse['ease'] = m[4];
      return pulse;
    }
    // Celebrate: "nhún 1.0→1.12→1.0, 2 lần, 0.8s"
    if ((m = new RegExp(`^nhún ${N}→${N}→${N}, (\\d+) lần, ${N}s$`).exec(s))) {
      return { scales: [num(m[1]!), num(m[2]!), num(m[3]!)], repeat: num(m[4]!), durationMs: ms(m[5]!) };
    }
    // React: "nảy 1.1×, 0.3s"
    if ((m = new RegExp(`^nảy ${N}×, ${N}s$`).exec(s))) return { scale: num(m[1]!), durationMs: ms(m[2]!) };
    // Motion: "0.5s ease-out" / "0.2s ease-out, nảy 1.05×"
    if ((m = new RegExp(`^${N}s ([a-z-]+)(?:, nảy ${N}×)?$`).exec(s))) {
      const motion: TokenObject = { durationMs: ms(m[1]!), ease: m[2]! };
      if (m[3]) motion['scale'] = num(m[3]);
      return motion;
    }
    // Wave: "2 vòng {colors.x} 40% lan ra, 1 Hz"
    if ((m = new RegExp(`^(\\d+) vòng ${REF} ${N}% lan ra, ${N} Hz$`).exec(s))) {
      return {
        rings: num(m[1]!),
        color: withAlpha(refColor(m[2]!, m[3]!), num(m[4]!) / 100) as unknown as TokenValue,
        hz: num(m[5]!),
      };
    }
    // drop-shadow(0 6px 6px rgba(...))
    if ((m = /^drop-shadow\((.+)\)$/.exec(s))) return shadowLayer(m[1]!.trim());
    // Box shadow list
    if (/rgba?\(/.test(s) && splitTopLevel(s).every((p) => /rgba?\(.*\)$/.test(p))) {
      return splitTopLevel(s).map(shadowLayer);
    }
    // Position: "top-left: left {spacing.a}, top {spacing.b}" / "right {spacing.a}, top {spacing.b}"
    if (/^(?:[a-z-]+: )?(?:left|right|top|bottom) \{/.test(s)) {
      const body = s.replace(/^[a-z-]+: /, '');
      const pos: TokenObject = {};
      for (const part of splitTopLevel(body)) {
        const pm = new RegExp(`^(left|right|top|bottom) ${REF}$`).exec(part);
        if (!pm) throw new TokenParseError(`bad position part "${part}" in "${s}"`);
        pos[pm[1]!] = refNumber(pm[2]!, pm[3]!);
      }
      return pos;
    }
    if (FREE_TEXT_KEYS.has(key)) return s;
    throw new TokenParseError(`unrecognised token value for "${key}": "${s}" — teach tools/tokens/parse.ts this format`);
  }

  function parseValue(key: string, v: unknown): TokenValue {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseString(key, v.trim());
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: TokenObject = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const ck = camelCase(k);
        out[ck] = parseValue(ck, child);
      }
      return out;
    }
    throw new TokenParseError(`unsupported token value for "${key}": ${JSON.stringify(v)}`);
  }

  function parseGroupEntry(group: Group, key: string, v: unknown): TokenValue {
    if (group === 'colors') {
      if (typeof v !== 'string') throw new TokenParseError(`colors.${key} must be a hex string`);
      return hexColor(v) as unknown as TokenValue;
    }
    return parseValue(camelCase(key), v);
  }

  const out: TokenObject = {};
  for (const g of GROUPS) {
    const groupOut: TokenObject = {};
    for (const key of Object.keys(design[g])) groupOut[camelCase(key)] = resolveRef(g, key);
    out[g] = groupOut;
  }
  return out;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** Deterministic TS literal serialiser (colour `value`s printed as 0xRRGGBB). */
export function serialise(value: TokenValue, indent = 0, key = ''): string {
  const pad = '  '.repeat(indent + 1);
  const end = '  '.repeat(indent);
  if (typeof value === 'number') {
    if (key === 'value' && Number.isInteger(value)) return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'number')) return `[${value.join(', ')}]`;
    return `[\n${value.map((v) => pad + serialise(v, indent + 1)).join(',\n')}\n${end}]`;
  }
  const entries = Object.entries(value);
  const prop = (k: string): string => (IDENT.test(k) ? k : `'${k}'`);
  if (entries.every(([, v]) => typeof v !== 'object')) {
    const inline = `{ ${entries.map(([k, v]) => `${prop(k)}: ${serialise(v, indent + 1, k)}`).join(', ')} }`;
    if (inline.length <= 100) return inline;
  }
  const body = entries
    .map(([k, v]) => `${pad}${prop(k)}: ${serialise(v, indent + 1, k)}`)
    .join(',\n');
  return `{\n${body}\n${end}}`;
}

export function renderModule(tokens: TokenObject): string {
  return [
    '// GENERATED by tools/tokens from DESIGN.md YAML front matter — DO NOT EDIT.',
    '// Run `npm run tokens` after changing DESIGN.md. `npm run check` fails if this file is stale.',
    '',
    `export const designTokens = ${serialise(tokens)} as const;`,
    '',
    'export type DesignTokens = typeof designTokens;',
    '',
  ].join('\n');
}
