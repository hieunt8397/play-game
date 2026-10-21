import { describe, expect, it } from 'vitest';
import { parseDesign, TokenParseError } from './parse.ts';

/** Smallest valid front matter; `extra` is merged per group. */
function design(extra: Partial<Record<'colors' | 'typography' | 'rounded' | 'spacing' | 'components', Record<string, unknown>>> = {}) {
  return {
    colors: { white: '#FFFFFF', ...extra.colors },
    typography: { ...extra.typography },
    rounded: { full: '9999px', ...extra.rounded },
    spacing: { gap: '24px', ...extra.spacing },
    components: { ...extra.components },
  };
}

describe('parseDesign fails closed', () => {
  it('rejects an unrecognised string value', () => {
    expect(() => parseDesign(design({ components: { thing: { mood: 'very happy' } } }))).toThrow(TokenParseError);
  });

  it('rejects a circular reference', () => {
    expect(() => parseDesign(design({ components: { a: { base: '{components.b}' }, b: { base: '{components.a}' } } }))).toThrow(
      /circular/,
    );
  });

  it('rejects an unknown reference', () => {
    expect(() => parseDesign(design({ components: { a: { color: '{colors.nope}' } } }))).toThrow(/unknown token reference/);
  });

  it('rejects a missing group', () => {
    const { spacing: _spacing, ...noSpacing } = design();
    expect(() => parseDesign(noSpacing)).toThrow(TokenParseError);
    expect(() => parseDesign(noSpacing)).toThrow(/missing "spacing"/);
  });

  it('passes free-text keys through unchanged', () => {
    const text = 'giữa màn, phía trên trạm vừa chơi';
    const tokens = parseDesign(design({ components: { overlay: { placement: text, gap: '{spacing.gap}' } } }));
    expect(tokens['components']).toEqual({ overlay: { placement: text, gap: 24 } });
  });
});
