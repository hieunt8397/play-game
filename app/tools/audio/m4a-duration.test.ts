// Story 5.3: m4aDurationMs on synthetic MP4 buffers (v0, v1, moov after mdat, truncated, no moov) and the real voice files.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { m4aDurationMs } from './m4a-duration.ts';

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function mvhd0(timescale: number, duration: number): Uint8Array {
  const p = new Uint8Array(100);
  const v = new DataView(p.buffer);
  v.setUint8(0, 0);
  v.setUint32(12, timescale);
  v.setUint32(16, duration);
  return box('mvhd', p);
}

function mvhd1(timescale: number, duration: bigint): Uint8Array {
  const p = new Uint8Array(112);
  const v = new DataView(p.buffer);
  v.setUint8(0, 1);
  v.setUint32(20, timescale);
  v.setBigUint64(24, duration);
  return box('mvhd', p);
}

const ftyp = box('ftyp', new Uint8Array(12));
const mdat = box('mdat', new Uint8Array(64));
const trak = box('trak', new Uint8Array(20));

describe('m4aDurationMs', () => {
  it('version 0: duration / timescale', () => {
    expect(m4aDurationMs(concat(ftyp, box('moov', concat(mvhd0(44100, 176400), trak)), mdat))).toBe(4000);
  });

  it('version 1 (64-bit times)', () => {
    expect(m4aDurationMs(concat(ftyp, box('moov', mvhd1(1000, 3997n))))).toBeCloseTo(3997, 6);
  });

  it('moov after mdat; mvhd not first inside moov', () => {
    expect(m4aDurationMs(concat(ftyp, mdat, box('moov', concat(trak, mvhd0(48000, 202080)))))).toBeCloseTo(4210, 6);
  });

  it('a 64-bit (size 1) mdat before moov is walked over', () => {
    const big = new Uint8Array(16 + 10);
    const v = new DataView(big.buffer);
    v.setUint32(0, 1);
    for (let i = 0; i < 4; i++) big[4 + i] = 'mdat'.charCodeAt(i);
    v.setBigUint64(8, BigInt(big.length));
    expect(m4aDurationMs(concat(big, box('moov', mvhd0(1000, 2500))))).toBe(2500);
  });

  it('truncated: moov cut off, or mvhd too short → undefined', () => {
    const whole = concat(ftyp, mdat, box('moov', mvhd0(1000, 2500)));
    expect(m4aDurationMs(whole.subarray(0, whole.length - 30))).toBeUndefined();
    expect(m4aDurationMs(concat(ftyp, box('moov', box('mvhd', new Uint8Array(10)))))).toBeUndefined();
    expect(m4aDurationMs(new Uint8Array(5))).toBeUndefined();
  });

  it('no moov, no mvhd, zero timescale → undefined', () => {
    expect(m4aDurationMs(concat(ftyp, mdat))).toBeUndefined();
    expect(m4aDurationMs(concat(ftyp, box('moov', trak)))).toBeUndefined();
    expect(m4aDurationMs(concat(ftyp, box('moov', mvhd0(0, 10))))).toBeUndefined();
    // A zero or v0 all-ones ("indefinite") duration is not a length.
    expect(m4aDurationMs(concat(ftyp, box('moov', mvhd0(1000, 0))))).toBeUndefined();
    expect(m4aDurationMs(concat(ftyp, box('moov', mvhd0(1000, 0xffffffff))))).toBeUndefined();
  });

  it('reads every real voice file (0 < length ≤ 10 s)', () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/assets/audio/vo');
    let files: string[];
    try {
      files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.m4a'));
    } catch {
      return; // no generated voice in this checkout
    }
    for (const f of files) {
      const ms = m4aDurationMs(readFileSync(join(dir, f)));
      expect(ms, f).toBeGreaterThan(0);
      expect(ms!, f).toBeLessThan(10000);
    }
  });
});
