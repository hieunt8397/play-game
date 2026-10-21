// Story 5.3 (NFR15): the length of an `.m4a` (MP4) file, read offline in pure TS from its `moov/mvhd`
// box — duration / timescale. It matches ffprobe on every voice line and needs no binary, so
// `validate:content` can measure prompt lengths inside `npm run check`.
// Walks the top-level boxes until `moov` (which may come before or after `mdat`), then the boxes inside
// it. `mvhd` version 0 stores 32-bit times, version 1 64-bit ones. A box that runs past the end of the
// buffer, a missing `moov`/`mvhd` or a zero timescale → undefined.

const HEADER = 8;
const LARGE_HEADER = 16;
const SIZE_LARGE = 1;
const SIZE_TO_END = 0;
const TYPE_AT = 4;
const TYPE_LENGTH = 4;
const MS_PER_S = 1000;
const UINT32 = 4;
const UINT32_MAX = 0xffffffff;
/** mvhd v0: version+flags (4), creation (4), modification (4), then timescale (4) and duration (4). */
const V0_TIMESCALE_AT = 12;
const V0_LENGTH = 20;
/** mvhd v1: version+flags (4), creation (8), modification (8), then timescale (4) and duration (8). */
const V1_TIMESCALE_AT = 20;
const V1_LENGTH = 32;

interface Box {
  /** Start of the payload (after the header). */
  readonly body: number;
  /** End of the box (exclusive). */
  readonly end: number;
}

/** The first box of `type` among the boxes in [from, to), or undefined (also on a malformed box before it). */
function findBox(view: DataView, from: number, to: number, type: string): Box | undefined {
  let at = from;
  while (at + HEADER <= to) {
    const size32 = view.getUint32(at);
    let name = '';
    for (let i = 0; i < TYPE_LENGTH; i++) name += String.fromCharCode(view.getUint8(at + TYPE_AT + i));
    let body = at + HEADER;
    let end: number;
    if (size32 === SIZE_LARGE) {
      if (at + LARGE_HEADER > to) return undefined;
      end = at + Number(view.getBigUint64(at + HEADER));
      body = at + LARGE_HEADER;
    } else if (size32 === SIZE_TO_END) {
      end = to;
    } else {
      end = at + size32;
    }
    if (end < body || end > to) return undefined;
    if (name === type) return { body, end };
    at = end;
  }
  return undefined;
}

/** Milliseconds of the movie in `buf` (an `.m4a` file), or undefined when it has no readable `mvhd`. */
export function m4aDurationMs(buf: Uint8Array): number | undefined {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const moov = findBox(view, 0, buf.byteLength, 'moov');
  if (!moov) return undefined;
  const mvhd = findBox(view, moov.body, moov.end, 'mvhd');
  if (!mvhd) return undefined;
  const len = mvhd.end - mvhd.body;
  if (len < 1) return undefined;
  const version = view.getUint8(mvhd.body);
  let timescale: number;
  let duration: number;
  if (version === 0 && len >= V0_LENGTH) {
    timescale = view.getUint32(mvhd.body + V0_TIMESCALE_AT);
    duration = view.getUint32(mvhd.body + V0_TIMESCALE_AT + UINT32);
  } else if (version === 1 && len >= V1_LENGTH) {
    timescale = view.getUint32(mvhd.body + V1_TIMESCALE_AT);
    duration = Number(view.getBigUint64(mvhd.body + V1_TIMESCALE_AT + UINT32));
  } else {
    return undefined;
  }
  // 0 (unknown) and all-ones (the "indefinite" marker) are not lengths.
  if (timescale === 0 || duration === 0 || (version === 0 && duration === UINT32_MAX)) return undefined;
  return (duration / timescale) * MS_PER_S;
}
