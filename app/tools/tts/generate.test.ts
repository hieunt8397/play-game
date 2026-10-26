// tools/tts: the TTS matrix rows (args, skip rules, missing tools, loudnorm parse) with injected
// probe/exec — never calls ElevenLabs or spawns ffmpeg.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { VOICE_DEFAULTS } from "../../src/content/voice-lines.ts";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportedVoiceLine } from "../content/export-voice-lines.ts";
import { exportRecords } from "../content/export-voice-lines.ts";
import {
  SPEAK_ATTEMPTS,
  SPEAK_SCRIPT,
  loudnormPass1Args,
  loudnormPass2Args,
  parseLoudnorm,
  planLine,
  runTts,
  nonFiniteInputI,
  speakArgs,
  splitSegments,
  spokenText,
  trimArgs,
  type Exec,
} from "./generate.ts";
import { lineHash } from "./line-hash.ts";
import { parseDotenv, readApiKey, requestBody } from "./elevenlabs.ts";

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const PASS1_STDERR = `[Parsed_loudnorm_0 @ 0000]
{
	"input_i" : "-21.37",
	"input_tp" : "-4.12",
	"input_lra" : "3.10",
	"input_thresh" : "-31.60",
	"output_i" : "-16.02",
	"output_tp" : "-1.50",
	"output_lra" : "2.90",
	"output_thresh" : "-26.20",
	"normalization_type" : "linear",
	"target_offset" : "0.02"
}
`;

describe("TTS args", () => {
  it("trim: removes leading and trailing silence, decodes to mono 44.1 kHz PCM", () => {
    const args = trimArgs("seg.mp3", "seg.wav");
    expect(valueAfter(args, "-i")).toBe("seg.mp3");
    expect(valueAfter(args, "-af")).toBe(
      "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
    );
    expect(valueAfter(args, "-ac")).toBe("1");
    expect(valueAfter(args, "-ar")).toBe("44100");
    expect(valueAfter(args, "-c:a")).toBe("pcm_s16le");
    expect(args.at(-1)).toBe("seg.wav");
  });

  it('splits "a | b" into ["a", "b"]', () => {
    expect(splitSegments("a | b")).toEqual(["a", "b"]);
    expect(splitSegments("Bé ơi, mình cùng | chơi nào!")).toEqual([
      "Bé ơi, mình cùng",
      "chơi nào!",
    ]);
    expect(splitSegments("no bar")).toEqual(["no bar"]);
  });

  it("spoken text: the v3 style tag, then the segments joined (no inserted pause)", () => {
    expect(spokenText(splitSegments("Bé ơi, mình cùng | chơi nào!"))).toBe(
      "[cheerfully] Bé ơi, mình cùng chơi nào!",
    );
  });

  it("speak: the ElevenLabs child script with Thắm, eleven_v3, speed, text and out file", () => {
    const args = speakArgs("[cheerfully] chơi nào!", 1, "speech.mp3");
    expect(args[0]).toBe(SPEAK_SCRIPT);
    expect(SPEAK_SCRIPT).toMatch(/elevenlabs\.ts$/);
    expect(valueAfter(args, "--voice")).toBe("0ggMuQ1r9f9jqBu50nJn");
    expect(valueAfter(args, "--model")).toBe("eleven_v3");
    expect(valueAfter(args, "--speed")).toBe("1");
    expect(valueAfter(args, "--text")).toBe("[cheerfully] chơi nào!");
    expect(valueAfter(args, "--out")).toBe("speech.mp3");
  });

  it("request body: Vietnamese, the model; voice_settings.speed only when not 1", () => {
    const req = { voice: "v", model: "eleven_v3", speed: 1, text: "chơi nào" };
    expect(requestBody(req)).toEqual({ text: "chơi nào", model_id: "eleven_v3", language_code: "vi" });
    expect(requestBody({ ...req, speed: 0.9 })).toMatchObject({ voice_settings: { speed: 0.9 } });
  });

  it("API key: env first, else .env (KEY=value, quotes and comments handled)", () => {
    expect(parseDotenv('# c\r\nA=1\r\nELEVENLABS_API_KEY="k"\nB')).toEqual({ A: "1", ELEVENLABS_API_KEY: "k" });
    const root = mkdtempSync(join(tmpdir(), "bhc-key-"));
    roots.push(root);
    const app = join(root, "app");
    mkdirSync(app);
    expect(readApiKey({}, app)).toBeUndefined();
    writeFileSync(join(root, ".env"), "ELEVENLABS_API_KEY=from-file\n");
    expect(readApiKey({}, app)).toBe("from-file");
    expect(readApiKey({ ELEVENLABS_API_KEY: " from-env " }, app)).toBe("from-env");
  });

  it("loudnorm pass 1 measures I=-16 TP=-1.5 LRA=11 as JSON, writes nothing", () => {
    const args = loudnormPass1Args("in.wav");
    expect(valueAfter(args, "-af")).toBe(
      "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
    );
    expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
  });

  it("parses input_i, input_tp, input_lra, input_thresh, target_offset from pass-1 stderr", () => {
    expect(parseLoudnorm(PASS1_STDERR)).toEqual({
      input_i: -21.37,
      input_tp: -4.12,
      input_lra: 3.1,
      input_thresh: -31.6,
      target_offset: 0.02,
    });
  });

  it("bad or incomplete pass-1 JSON throws", () => {
    expect(() => parseLoudnorm("no json here")).toThrow(/no JSON/);
    expect(() => parseLoudnorm('{ "input_i": "-20", oops }')).toThrow();
    expect(() => parseLoudnorm('{ "input_i": "-20" }')).toThrow(/input_tp/);
    expect(() =>
      parseLoudnorm(PASS1_STDERR.replace('"-4.12"', '"-inf"')),
    ).toThrow(/input_tp/);
  });

  it("loudnorm pass 2: measured values, linear=true, AAC mono 44.1 kHz 64k", () => {
    const args = loudnormPass2Args(
      "in.wav",
      parseLoudnorm(PASS1_STDERR),
      "out.m4a",
    );
    expect(valueAfter(args, "-af")).toBe(
      "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-21.37:measured_TP=-4.12:measured_LRA=3.1:measured_thresh=-31.6:offset=0.02:linear=true:print_format=summary",
    );
    expect(valueAfter(args, "-ac")).toBe("1");
    expect(valueAfter(args, "-ar")).toBe("44100");
    expect(valueAfter(args, "-c:a")).toBe("aac");
    expect(valueAfter(args, "-b:a")).toBe("64k");
    expect(args.at(-1)).toBe("out.m4a");
  });
});

describe("planLine (skip rules)", () => {
  const line: ExportedVoiceLine = {
    id: "vo.shell.greeting",
    text: "Bé ơi | chơi nào!",
    keywordPauseMs: 300,
    path: "assets/audio/vo/vo.shell.greeting.m4a",
    textHash: "h1",
  };

  it("approved + hash match + file → skip, even with --force", () => {
    const approved = { ...line, approved: { textHash: "h1" } };
    expect(
      planLine(approved, { audioExists: true, existingHash: "h1" }, true),
    ).toEqual({ action: "skip", reason: "approved" });
    expect(
      planLine(approved, { audioExists: true, existingHash: undefined }, false),
    ).toEqual({ action: "skip", reason: "approved" });
  });

  it("approved but the file is gone → generate", () => {
    const approved = { ...line, approved: { textHash: "h1" } };
    expect(
      planLine(approved, { audioExists: false, existingHash: undefined }, false)
        .action,
    ).toBe("generate");
  });

  it("current .hash → skip unless --force", () => {
    expect(
      planLine(line, { audioExists: true, existingHash: "h1" }, false),
    ).toEqual({ action: "skip", reason: "current" });
    expect(
      planLine(line, { audioExists: true, existingHash: "h1" }, true).action,
    ).toBe("generate");
  });

  it("stale hash or missing file → generate the whole spoken sentence at the default rate", () => {
    expect(
      planLine(line, { audioExists: true, existingHash: "old" }, false),
    ).toEqual({
      action: "generate",
      text: "[cheerfully] Bé ơi chơi nào!",
      rate: 1,
      hash: "h1",
    });
    expect(
      planLine(line, { audioExists: false, existingHash: "h1" }, false).action,
    ).toBe("generate");
  });
});

describe("lineHash", () => {
  it("is sha256 hex of the documented JSON (NFC text, null pause, default rate 1)", () => {
    const h = lineHash({ text: "Chơi nào" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(lineHash({ text: "Chơi nào".normalize("NFD") })).toBe(h);
    expect(lineHash({ text: "Chơi nào", rate: 1 })).toBe(h);
    expect(lineHash({ text: "Chơi nào", rate: 0.9 })).not.toBe(h);
    expect(lineHash({ text: "Chơi | nào", keywordPauseMs: 300 })).not.toBe(
      lineHash({ text: "Chơi | nào", keywordPauseMs: 200 }),
    );
  });
});

// --- runTts with a temp app root and fake binaries -------------------------------------------

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

const GREETING = {
  id: "vo.shell.greeting",
  text: "Bé ơi, mình cùng | chơi nào!",
  keywordPauseMs: 300,
} as const;

function appRoot(
  lines: ReadonlyArray<Parameters<typeof exportRecords>[0][number]> = [
    GREETING,
  ],
  exported = true,
): string {
  const root = mkdtempSync(join(tmpdir(), "bhc-tts-"));
  roots.push(root);
  if (exported) {
    mkdirSync(join(root, ".generated"), { recursive: true });
    writeFileSync(
      join(root, ".generated", "voice-lines.json"),
      JSON.stringify(exportRecords(lines)),
    );
  }
  return root;
}

/** Fake TTS/ffmpeg: writes each output file, answers pass 1 with loudnorm JSON. */
const isSpeak = (args: readonly string[]) => args[0] === SPEAK_SCRIPT;
function fakeExec(opts: { speakFailures?: number } = {}) {
  let speakFailures = opts.speakFailures ?? 0;
  const calls: Array<{ bin: string; args: readonly string[] }> = [];
  const exec = vi.fn<Exec>((bin, args) => {
    calls.push({ bin, args });
    if (isSpeak(args)) {
      if (speakFailures > 0) {
        speakFailures--;
        return { status: 1, stderr: "elevenlabs: HTTP 429" };
      }
      const out = valueAfter(args, "--out")!;
      writeFileSync(out, "mp3");
      return { status: 0, stderr: "" };
    }
    if (args.includes("null")) return { status: 0, stderr: PASS1_STDERR };
    const out = args.at(-1)!;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `audio from ${out}`);
    return { status: 0, stderr: "" };
  });
  return { exec, calls };
}

const allTools = () => true;

function tts(
  root: string,
  exec: Exec,
  extra: Partial<Parameters<typeof runTts>[0]> = {},
) {
  const errors: string[] = [];
  const logs: string[] = [];
  const code = runTts({
    appRoot: root,
    argv: [],
    env: { ELEVENLABS_API_KEY: "test-key" },
    probe: allTools,
    exec,
    log: (m) => void logs.push(m),
    error: (m) => void errors.push(m),
    sleep: () => undefined,
    ...extra,
  });
  return { code, errors, logs };
}

const audioOut = (root: string) =>
  join(root, "public", "assets", "audio", "vo", "vo.shell.greeting.m4a");
const hashOut = (root: string) =>
  join(root, "public", "assets", "audio", "vo", "vo.shell.greeting.hash");

describe("runTts", () => {
  it.each([
    ["ffmpeg not found", { probe: (bin: string) => bin !== "ffmpeg" }],
    ["ELEVENLABS_API_KEY not set", { env: {} }],
  ])(
    "%s: exit 1 naming it, before any work; no file written",
    (message, extra) => {
      const root = appRoot();
      const { exec } = fakeExec();
      const r = tts(root, exec, extra);
      expect(r.code).toBe(1);
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatch(new RegExp(`^tts: ${message}`));
      expect(exec).not.toHaveBeenCalled();
      expect(existsSync(join(root, "public"))).toBe(false);
      expect(readdirSync(join(root, ".generated"))).toEqual([
        "voice-lines.json",
      ]);
    },
  );

  it("missing tool is reported even before a missing export", () => {
    const root = appRoot([GREETING], false);
    const r = tts(root, fakeExec().exec, { probe: () => false });
    expect(r.errors[0]).toMatch(/ffmpeg not found/);
  });

  it('missing export: exit 1 with "run npm run content:export"', () => {
    const root = appRoot([GREETING], false);
    const r = tts(root, fakeExec().exec);
    expect(r.code).toBe(1);
    expect(r.errors[0]).toMatch(/run npm run content:export/);
  });

  it("first run writes .m4a and .hash (one request for the whole sentence); second run skips", () => {
    const root = appRoot();
    const first = fakeExec();
    expect(tts(root, first.exec).code).toBe(0);
    expect(readFileSync(hashOut(root), "utf8")).toBe(`${lineHash(GREETING)}\n`);
    expect(existsSync(audioOut(root))).toBe(true);
    const speak = first.calls.filter((c) => isSpeak(c.args));
    expect(speak.map((c) => valueAfter(c.args, "--text"))).toEqual([
      "[cheerfully] Bé ơi, mình cùng chơi nào!",
    ]);
    expect(speak[0]!.bin).toBe(process.execPath);
    expect(first.calls.some((c) => c.args.includes("-filter_complex"))).toBe(false);
    // temp dirs are cleaned up
    expect(readdirSync(join(root, ".generated"))).toEqual(["voice-lines.json"]);

    const second = fakeExec();
    const r2 = tts(root, second.exec);
    expect(r2.code).toBe(0);
    expect(second.exec).not.toHaveBeenCalled();
    expect(r2.logs[0]).toMatch(/skip vo\.shell\.greeting \(up to date\)/);
  });

  it("--force regenerates a current line, but never an approved one", () => {
    const root = appRoot();
    tts(root, fakeExec().exec);
    const forced = fakeExec();
    expect(tts(root, forced.exec, { argv: ["--force"] }).code).toBe(0);
    expect(forced.exec).toHaveBeenCalled();

    const approvedRoot = appRoot([
      { ...GREETING, approved: { textHash: lineHash(GREETING) } },
    ]);
    tts(approvedRoot, fakeExec().exec);
    const before = readFileSync(audioOut(approvedRoot), "utf8");
    writeFileSync(hashOut(approvedRoot), "something-else\n");
    const again = fakeExec();
    const r = tts(approvedRoot, again.exec, { argv: ["--force"] });
    expect(r.code).toBe(0);
    expect(again.exec).not.toHaveBeenCalled();
    expect(readFileSync(audioOut(approvedRoot), "utf8")).toBe(before);
    // …but its stale .hash is repaired, so npm run check can pass again.
    expect(readFileSync(hashOut(approvedRoot), "utf8").trim()).toBe(
      lineHash(GREETING),
    );
  });

  it("a stale .hash regenerates without --force", () => {
    const root = appRoot();
    tts(root, fakeExec().exec);
    writeFileSync(hashOut(root), "old\n");
    const again = fakeExec();
    tts(root, again.exec);
    expect(again.exec).toHaveBeenCalled();
    expect(readFileSync(hashOut(root), "utf8").trim()).toBe(lineHash(GREETING));
  });

  it("retries a flaky TTS request, then succeeds", () => {
    const root = appRoot();
    const sleep = vi.fn();
    const { exec } = fakeExec({ speakFailures: 2 });
    expect(tts(root, exec, { sleep }).code).toBe(0);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last TTS attempt: exit 1, nothing written, temp cleaned", () => {
    const root = appRoot();
    const r = tts(root, fakeExec({ speakFailures: SPEAK_ATTEMPTS }).exec);
    expect(r.code).toBe(1);
    expect(r.errors[0]).toMatch(
      /vo\.shell\.greeting.*TTS failed 5 times/s,
    );
    expect(existsSync(audioOut(root))).toBe(false);
    expect(existsSync(hashOut(root))).toBe(false);
    expect(readdirSync(join(root, ".generated"))).toEqual(["voice-lines.json"]);
  });
});

describe("runTts — a line too short for loudnorm (Story 3.1)", () => {
  it('pass 1 reads "input_i": "-inf" → measured again padded with apad=whole_dur=1; exit 0', () => {
    const root = appRoot([{ id: "vo.pizza.count.1", text: "Một!" }]);
    const base = fakeExec();
    const pass1: string[] = [];
    const exec = vi.fn<Exec>((bin, args) => {
      if (!isSpeak(args) && args.includes("null")) {
        const af = valueAfter(args, "-af") ?? "";
        pass1.push(af);
        return { status: 0, stderr: af.startsWith("apad=whole_dur=1") ? PASS1_STDERR : PASS1_STDERR.replace('"-21.37"', '"-inf"') };
      }
      return base.exec(bin, args);
    });
    const r = tts(root, exec);
    expect(r.code).toBe(0);
    expect(pass1).toHaveLength(2);
    expect(pass1[0]!.startsWith("apad")).toBe(false);
    expect(pass1[1]!.startsWith("apad=whole_dur=1,")).toBe(true);
  });

  it("nonFiniteInputI: only a present, non-finite input_i", () => {
    expect(nonFiniteInputI(PASS1_STDERR)).toBe(false);
    expect(nonFiniteInputI(PASS1_STDERR.replace('"-21.37"', '"-inf"'))).toBe(true);
    expect(nonFiniteInputI(PASS1_STDERR.replace('"-4.12"', '"-inf"'))).toBe(false);
    expect(nonFiniteInputI("no json")).toBe(false);
  });
});

describe("per-line style (Story 7.4 review)", () => {
  it("a line without `style` keeps its old hash (the recipe-v2 payload with VOICE_DEFAULTS.style)", () => {
    const line = { text: "Xoài ơi, mình cùng | chơi nào!", keywordPauseMs: 300 };
    const old = createHash("sha256")
      .update(
        JSON.stringify({
          v: 2,
          model: VOICE_DEFAULTS.model,
          style: VOICE_DEFAULTS.style,
          voice: VOICE_DEFAULTS.voice,
          text: line.text.normalize("NFC"),
          keywordPauseMs: 300,
          rate: VOICE_DEFAULTS.rate,
        }),
        "utf8",
      )
      .digest("hex");
    expect(lineHash(line)).toBe(old);
    expect(lineHash({ ...line, style: "[softly]" })).not.toBe(old);
  });

  it("spokenText and planLine use the line's own style; the export carries it", () => {
    expect(spokenText(["Chúc bạn ngủ ngon!"], "[softly]")).toBe("[softly] Chúc bạn ngủ ngon!");
    expect(spokenText(["Chúc bạn ngủ ngon!"])).toBe(`${VOICE_DEFAULTS.style} Chúc bạn ngủ ngon!`);
    const [rec] = exportRecords([{ id: "vo.bedtime.goodnight", text: "Chúc bạn ngủ ngon!", style: "[softly]" }]);
    expect(rec!.style).toBe("[softly]");
    const plan = planLine(rec!, { audioExists: false, existingHash: undefined }, false);
    expect(plan).toMatchObject({ action: "generate", text: "[softly] Chúc bạn ngủ ngon!" });
  });
});
