import { describe, expect, it } from "vitest";
import { GAME_IDS, ISLAND_GAME_IDS } from "./types";
import { validateContent, validateDecorationCatalogue, validateGames, validateParentInvite, validateStations } from "./validate";
import { PARENT_INVITE_LINES } from "./parent-invite";
import { DECORATIONS } from "./decorations";
import { GAME_CONTENT } from "./games/index";
import { GAME_STATIONS, HOME_STATION, STATIONS } from "./stations";
import { AUDIO_CATALOG } from "./audio-catalog";
import { VOICE_LINES, stationNameLine, type VoiceLine } from "./voice-lines";

describe("validateContent", () => {
  it("accepts the real GameId list", () => {
    expect(validateContent({ gameIds: GAME_IDS })).toEqual([]);
  });

  it("reports a duplicated id", () => {
    const problems = validateContent({ gameIds: ["pizza", "race", "pizza"] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"pizza" is duplicated/);
  });

  it("reports a non-kebab-case id", () => {
    const problems = validateContent({ gameIds: ["Ice_cream"] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"Ice_cream" is not kebab-case/);
  });
});

describe("validateContent › audio catalog", () => {
  it("accepts the real catalog", () => {
    expect(validateContent({ gameIds: [], audio: AUDIO_CATALOG })).toEqual([]);
  });

  it("rejects ids outside the sfx.<scope>.<name> / music.<name> grammar", () => {
    const problems = validateContent({
      gameIds: [],
      audio: {
        "sfx.pop": { path: "assets/audio/sfx/sfx.pop.m4a", kind: "sfx" },
        "Music.Island": {
          path: "assets/audio/music/Music.Island.m4a",
          kind: "music",
        },
      },
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/"sfx.pop" must match/);
  });

  it("Story 3.3: accepts a subject segment (sfx.<scope>.<subject>.<name>), but not two", () => {
    const problems = validateContent({
      gameIds: [],
      audio: {
        "sfx.dino-puzzle.triceratops.happy": { path: "assets/audio/sfx/sfx.dino-puzzle.triceratops.happy.m4a", kind: "sfx" },
        "sfx.a.b.c.d": { path: "assets/audio/sfx/sfx.a.b.c.d.m4a", kind: "sfx" },
      },
    });
    expect(problems).toEqual(['audio id "sfx.a.b.c.d" must match sfx.<scope>[.<subject>].<name> or music.<name>']);
  });

  it("rejects a kind that does not match the id prefix", () => {
    const problems = validateContent({
      gameIds: [],
      audio: {
        "music.island": {
          path: "assets/audio/music/music.island.m4a",
          kind: "sfx",
        },
      },
    });
    expect(problems).toEqual([
      'audio id "music.island" has kind "sfx", expected "music"',
    ]);
  });

  it("rejects a path that is not assets/audio/<kind>/<id>.m4a", () => {
    const problems = validateContent({
      gameIds: [],
      audio: {
        "sfx.shell.pop": { path: "assets/audio/sfx/pop.mp3", kind: "sfx" },
      },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /expected "assets\/audio\/sfx\/sfx.shell.pop.m4a"/,
    );
  });

  it("reports a missing file only when a file check is given", () => {
    const audio = {
      "sfx.shell.pop": {
        path: "assets/audio/sfx/sfx.shell.pop.m4a",
        kind: "sfx",
      },
    };
    expect(validateContent({ gameIds: [], audio })).toEqual([]);
    const problems = validateContent({
      gameIds: [],
      audio,
      fileExists: () => false,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /public\/assets\/audio\/sfx\/sfx.shell.pop.m4a is missing/,
    );
  });
});

describe("validateContent › voice lines", () => {
  /** A fake hash: deterministic over everything lineHash covers. */
  const hashLine = (line: VoiceLine): string =>
    `h:${line.text}:${line.keywordPauseMs ?? "-"}:${line.rate ?? "-"}`;

  /** A file tree that matches `lines` exactly (every .m4a + current .hash), with overrides. */
  function voice(lines: readonly VoiceLine[], tree?: Record<string, string>) {
    const files: Record<string, string> = tree ?? {};
    if (!tree) {
      for (const line of lines) {
        files[`assets/audio/vo/${line.id}.m4a`] = "audio";
        files[`assets/audio/vo/${line.id}.hash`] = `${hashLine(line)}\n`;
      }
    }
    return {
      files,
      input: {
        lines,
        hashLine,
        fileExists: (p: string) => p in files,
        listVoiceFiles: () =>
          Object.keys(files).map((p) => p.slice("assets/audio/vo/".length)),
        readHash: (p: string) => files[p],
      },
    };
  }

  const ok: VoiceLine = {
    id: "vo.ice-cream.ask.strawberry.2",
    text: "Bé lấy kem | dâu nhé",
    keywordPauseMs: 300,
  };

  function problemsFor(line: VoiceLine): string[] {
    return validateContent({ gameIds: GAME_IDS, voice: voice([line]).input });
  }

  it("accepts the real voice lines when their files and hashes match", () => {
    expect(
      validateContent({ gameIds: GAME_IDS, voice: voice(VOICE_LINES).input }),
    ).toEqual([]);
  });

  it("accepts a good line with scope, intent, subject and number", () => {
    expect(problemsFor(ok)).toEqual([]);
  });

  it.each([
    ["vo.greeting", "too few segments"],
    ["vo.lobby.greeting", "unknown scope"],
    ["vo.shell.Greeting", "not kebab-case"],
    ["vo.shell.greet_ing", "underscore"],
    ["vo.shell.greeting.a.b.c", "too many segments"],
    ["sfx.shell.greeting", "wrong prefix"],
  ])('rejects id "%s" (%s) and names it', (id) => {
    const problems = problemsFor({ id, text: "Chơi nào" });
    expect(
      problems.some((p) => p.includes(`"${id}"`) && /must match vo\./.test(p)),
    ).toBe(true);
  });

  it("rejects a duplicated id", () => {
    const line: VoiceLine = { id: "vo.shell.greeting", text: "Chơi nào" };
    const problems = validateContent({
      gameIds: GAME_IDS,
      voice: voice([line, line]).input,
    });
    expect(problems).toEqual(['voice id "vo.shell.greeting" is duplicated']);
  });

  it("rejects | without keywordPauseMs and keywordPauseMs without |", () => {
    expect(problemsFor({ id: "vo.shell.a", text: "Bé ơi | chơi nào" })).toEqual(
      ['voice "vo.shell.a": text has "|" but no keywordPauseMs'],
    );
    expect(
      problemsFor({
        id: "vo.shell.b",
        text: "Bé ơi chơi nào",
        keywordPauseMs: 300,
      }),
    ).toEqual([
      'voice "vo.shell.b": keywordPauseMs is set but text has no "|"',
    ]);
  });

  it("rejects an empty text or an empty segment around |", () => {
    expect(
      problemsFor({
        id: "vo.shell.a",
        text: "| chơi nào",
        keywordPauseMs: 300,
      }),
    ).toEqual(['voice "vo.shell.a": empty text or empty segment around "|"']);
    expect(
      problemsFor({
        id: "vo.shell.b",
        text: "Bé ơi || chơi",
        keywordPauseMs: 300,
      }),
    ).toEqual(['voice "vo.shell.b": empty text or empty segment around "|"']);
    expect(problemsFor({ id: "vo.shell.c", text: " " })).toEqual([
      'voice "vo.shell.c": empty text or empty segment around "|"',
    ]);
  });

  it("rejects more than 8 words (the | is not a word)", () => {
    expect(
      problemsFor({
        id: "vo.shell.a",
        text: "một hai ba bốn năm sáu bảy | tám",
        keywordPauseMs: 300,
      }),
    ).toEqual([]);
    const problems = problemsFor({
      id: "vo.shell.a",
      text: "một hai ba bốn năm sáu bảy tám chín",
    });
    expect(problems).toEqual(['voice "vo.shell.a": 9 words (at most 8)']);
  });

  it.each([
    ["dâu", "đâu", "Kem dâu ở đâu?"],
    ["cá", "cà", "Con cá ăn cà chua."],
    ["ba", "bà", "Ba và bà."],
    ["bóng", "bông", "Quả bóng, bông hoa!"],
    ["cam", "cầm", "Bé cầm quả cam."],
  ])("rejects the near-homophones %s/%s in one sentence", (a, b, text) => {
    const problems = problemsFor({ id: "vo.shell.a", text });
    expect(problems).toEqual([
      `voice "vo.shell.a": near-homophones "${a}" and "${b}" in one sentence`,
    ]);
  });

  it("allows a banned pair split across sentences, and matches case- and NFC-insensitively", () => {
    expect(
      problemsFor({ id: "vo.shell.a", text: "Kem dâu đây. Bé ở đâu?" }),
    ).toEqual([]);
    // Decomposed (NFD) and upper-case input still counts.
    const nfd = "DÂU ở ĐÂU".normalize("NFD");
    expect(problemsFor({ id: "vo.shell.a", text: nfd })).toHaveLength(1);
  });

  it("reports a missing .m4a and a missing .hash, naming the id", () => {
    const v = voice([ok]);
    delete v.files[`assets/audio/vo/${ok.id}.m4a`];
    expect(validateContent({ gameIds: GAME_IDS, voice: v.input })).toEqual([
      `voice "${ok.id}": file public/assets/audio/vo/${ok.id}.m4a is missing (run npm run content:export && npm run tts)`,
    ]);
    const w = voice([ok]);
    delete w.files[`assets/audio/vo/${ok.id}.hash`];
    const problems = validateContent({ gameIds: GAME_IDS, voice: w.input });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /vo\.ice-cream\.ask\.strawberry\.2\.hash is missing/,
    );
  });

  it("reports a stale .hash (text edited without regenerating), naming the id", () => {
    const v = voice([ok]);
    const edited = { ...ok, text: "Bé lấy kem | vani nhé" };
    const problems = validateContent({
      gameIds: GAME_IDS,
      voice: { ...v.input, lines: [edited] },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /voice "vo\.ice-cream\.ask\.strawberry\.2": .* does not match the line/,
    );
  });

  it("accepts a hash with surrounding whitespace (readers trim)", () => {
    const v = voice([ok]);
    v.files[`assets/audio/vo/${ok.id}.hash`] = `  ${hashLine(ok)}\r\n`;
    expect(validateContent({ gameIds: GAME_IDS, voice: v.input })).toEqual([]);
  });

  it("reports approved.textHash that differs from the line hash", () => {
    const approved = { ...ok, approved: { textHash: hashLine(ok) } };
    expect(problemsFor(approved)).toEqual([]);
    const stale = { ...ok, approved: { textHash: "old" } };
    const problems = validateContent({
      gameIds: GAME_IDS,
      voice: voice([stale]).input,
    });
    expect(problems).toEqual([
      `voice "${ok.id}": approved.textHash does not match the line (listen again, then copy the new .hash)`,
    ]);
  });

  it("reports stray .m4a / .hash files with no line, naming their id; ignores other files", () => {
    const v = voice([ok]);
    v.files["assets/audio/vo/vo.shell.old.m4a"] = "audio";
    v.files["assets/audio/vo/vo.shell.older.hash"] = "x";
    v.files["assets/audio/vo/README.txt"] = "x";
    const problems = validateContent({ gameIds: GAME_IDS, voice: v.input });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/voice "vo\.shell\.old": stray file/);
    expect(problems[1]).toMatch(/voice "vo\.shell\.older": stray file/);
  });
});

describe("validateContent › stations (Story 1.5)", () => {
  const ids = VOICE_LINES.map((l) => l.id);

  it("accepts the real stations and voice lines", () => {
    expect(
      validateContent({ gameIds: GAME_IDS, stations: { stations: STATIONS, voiceIds: ids } }),
    ).toEqual([]);
  });

  it("reports an empty label by id", () => {
    const stations = STATIONS.map((s) => (s.id === "pizza" ? { ...s, label: " " } : s));
    expect(validateStations({ stations, voiceIds: ids })).toEqual(['station "pizza": label is empty']);
  });

  it("reports a missing name line by id", () => {
    const voiceIds = ids.filter((id) => id !== "vo.shell.station-name.race");
    expect(validateStations({ stations: STATIONS, voiceIds })).toEqual([
      'station "race": voice line "vo.shell.station-name.race" is missing',
    ]);
  });

  it("reports a missing invite line of an awake station only", () => {
    const voiceIds = ids.filter((id) => id !== "vo.shell.invite.ice-cream");
    expect(validateStations({ stations: STATIONS, voiceIds })).toEqual([
      'station "ice-cream": awake but voice line "vo.shell.invite.ice-cream" is missing',
    ]);
    const asleep = STATIONS.map((s) => ({ ...s, awake: false }));
    expect(validateStations({ stations: asleep, voiceIds })).toEqual([]);
  });

  it("every label is also the text of its name line", () => {
    for (const s of STATIONS) {
      expect(VOICE_LINES.find((l) => l.id === stationNameLine(s.id))?.text).toBe(s.label);
    }
    expect(STATIONS.filter((s) => s.awake).map((s) => s.id)).toEqual(["ice-cream", "pizza", "race", "fishing", "touch-talk", "dino-puzzle", "shadow-match", "home"]);
  });
});

describe("validateContent › games (Story 1.7)", () => {
  const voiceIds = VOICE_LINES.map((l) => l.id);
  const audioIds = Object.keys(AUDIO_CATALOG);
  const playable = Object.keys(GAME_CONTENT);

  it("accepts the real stations against GAME_CONTENT and the real game assets", () => {
    const games = Object.entries(GAME_CONTENT).map(([id, c]) => ({ id, audio: c!.assets.audio }));
    expect(
      validateContent({
        gameIds: GAME_IDS,
        stations: { stations: STATIONS, voiceIds, playable },
        games: { games, voiceIds, audioIds },
      }),
    ).toEqual([]);
  });

  it("awake mismatch: names the id both ways", () => {
    // Every station is awake since Story 4.5: drop one from GAME_CONTENT, then put one to sleep.
    expect(validateStations({ stations: STATIONS, voiceIds, playable: playable.filter((id) => id !== "touch-talk") })).toEqual([
      'station "touch-talk": awake but GAME_CONTENT has no "touch-talk" entry',
    ]);
    const sleeping = STATIONS.map((s) => (s.id === "touch-talk" ? { ...s, awake: false } : s));
    expect(validateStations({ stations: sleeping, voiceIds, playable })).toEqual([
      'station "touch-talk": GAME_CONTENT has "touch-talk" but the station is not awake',
    ]);
  });

  it("reports a game audio id that is neither a voice line nor a catalog id", () => {
    expect(
      validateGames({
        games: [{ id: "ice-cream", audio: ["sfx.shell.pop", "vo.shell.greeting", "vo.ice-cream.nope"] }],
        voiceIds,
        audioIds,
      }),
    ).toEqual(['game "ice-cream": asset audio id "vo.ice-cream.nope" is neither a voice line nor an audio-catalog id']);
  });
});

describe("validateContent › decorations (Story 2.2)", () => {
  const input = { gameIds: ISLAND_GAME_IDS, catalogue: DECORATIONS, stations: GAME_STATIONS };

  it("accepts the real catalogue and slots: 28 items, 1-2 slots per station (review loop 1b)", () => {
    expect(validateContent({ gameIds: GAME_IDS, decorations: input })).toEqual([]);
    expect(Object.values(DECORATIONS).flat()).toHaveLength(28);
    expect(STATIONS.reduce((n, s) => n + s.slots.length, 0)).toBe(9); // Story 7.1: pizza keeps 1
    // Story 7.1: the home station has no slot (no decorations); the game stations keep theirs.
    expect(STATIONS.find((s) => s.id === HOME_STATION)?.slots).toEqual([]);
    for (const s of GAME_STATIONS) {
      expect(s.slots.length).toBeGreaterThanOrEqual(1);
      expect(s.slots.length).toBeLessThanOrEqual(2);
      expect(s.slots).toEqual(s.slots.map((_, i) => `${s.id}-${i + 1}`));
      expect(DECORATIONS[s.id].length).toBeGreaterThan(s.slots.length);
    }
    expect(DECORATIONS["ice-cream"].map((d) => d.id)).toEqual(["parasol", "giant-cone", "popsicle", "sundae"]);
  });

  it("reports an empty catalogue by station id", () => {
    expect(validateDecorationCatalogue({ ...input, catalogue: { ...DECORATIONS, race: [] } })).toEqual([
      'decorations "race": the catalogue is empty',
    ]);
  });

  it("reports a non-kebab id and an id used by two stations", () => {
    const catalogue = {
      ...DECORATIONS,
      pizza: [{ id: "Pizza_Pie", model: "kenney/x.glb" }],
      race: [{ id: "parasol", model: "kenney/x.glb" }],
    };
    expect(validateDecorationCatalogue({ ...input, catalogue })).toEqual([
      'decoration "Pizza_Pie" (pizza): id is not kebab-case',
      'decoration "parasol" (race): id is already used by "ice-cream"',
    ]);
  });

  it("reports a model outside kenney/quaternius .glb/.fbx", () => {
    const catalogue = { ...DECORATIONS, race: [{ id: "cone", model: "other/cone.obj" }] };
    expect(validateDecorationCatalogue({ ...input, catalogue })[0]).toMatch(/^decoration "cone" \(race\): model "other\/cone.obj" must match/);
  });

  it("reports a station with no slot and slot ids that are not <id>-1..k", () => {
    const stations = GAME_STATIONS.map((s) =>
      s.id === "race" ? { ...s, slots: [] } : s.id === "pizza" ? { ...s, slots: ["pizza-1", "pizza-3"] } : s,
    );
    expect(validateDecorationCatalogue({ ...input, stations })).toEqual([
      'station "pizza": slot "pizza-3" must be "pizza-2" (ids <id>-1..k in order)',
      'station "race": has no decoration slot',
    ]);
  });
});

describe("validateParentInvite (Story 5.7)", () => {
  const voiceIds = VOICE_LINES.map((l) => l.id);
  const real = { gameIds: GAME_IDS, voiceIds, lines: PARENT_INVITE_LINES };

  it("the real lines pass", () => {
    expect(validateParentInvite(real)).toEqual([]);
  });

  it("every game needs 1–2 lines", () => {
    const problems = validateParentInvite({
      ...real,
      voiceIds: [...voiceIds, "vo.pizza.parent.2", "vo.pizza.parent.3"],
      lines: { ...PARENT_INVITE_LINES, race: [], pizza: ["vo.pizza.parent.1", "vo.pizza.parent.2", "vo.pizza.parent.3"] },
    });
    expect(problems).toEqual(['parent-invite "pizza": 3 lines (1–2)', 'parent-invite "race": 0 lines (1–2)', 'parent-invite: voice line "vo.race.parent.1" is not listed in PARENT_INVITE_LINES']);
  });

  it("a listed line must exist, be a parent line and belong to its game", () => {
    const problems = validateParentInvite({
      ...real,
      lines: { ...PARENT_INVITE_LINES, fishing: ["vo.fishing.parent.9"], race: ["vo.race.parent.1", "vo.pizza.parent.1"], unicorn: [] },
    });
    expect(problems).toEqual([
      'parent-invite: key "unicorn" is not a GameId',
      'parent-invite "race": "vo.pizza.parent.1" is not a vo.race.parent.<n> line',
      'parent-invite "fishing": voice line "vo.fishing.parent.9" does not exist',
      'parent-invite: voice line "vo.fishing.parent.1" is not listed in PARENT_INVITE_LINES',
    ]);
  });

  it("a duplicate in one game's list and malformed ids are rejected", () => {
    const problems = validateParentInvite({
      ...real,
      voiceIds: [...voiceIds, "vo.race.parent", "race.parent.2"],
      lines: { ...PARENT_INVITE_LINES, pizza: ["vo.pizza.parent.1", "vo.pizza.parent.1"], race: ["vo.race.parent", "race.parent.2"] },
    });
    expect(problems).toEqual([
      'parent-invite "pizza": "vo.pizza.parent.1" is listed twice',
      'parent-invite "race": "vo.race.parent" is not a vo.race.parent.<n> line',
      'parent-invite "race": "race.parent.2" is not a vo.race.parent.<n> line',
      'parent-invite: voice line "vo.race.parent.1" is not listed in PARENT_INVITE_LINES',
    ]);
  });

  it("an orphan parent-intent voice line is reported", () => {
    const problems = validateParentInvite({ ...real, voiceIds: [...voiceIds, "vo.race.parent.2"] });
    expect(problems).toEqual(['parent-invite: voice line "vo.race.parent.2" is not listed in PARENT_INVITE_LINES']);
  });

  it("validateContent runs the parent-invite rules", () => {
    expect(validateContent({ gameIds: GAME_IDS, parentInvite: { ...real, lines: { ...PARENT_INVITE_LINES, race: [] } } })).toHaveLength(2);
  });

  it("the existing name rule rejects Xoài in a parent line; the ≤ 4 s check covers parent lines", () => {
    const line: VoiceLine = { id: "vo.race.parent.1", text: "Xoài ơi, | hỏi bố xem!", keywordPauseMs: 300 };
    const files = new Set([`assets/audio/vo/${line.id}.m4a`, `assets/audio/vo/${line.id}.hash`]);
    const problems = validateContent({
      gameIds: GAME_IDS,
      voice: {
        lines: [line],
        hashLine: () => "h",
        fileExists: (path) => files.has(path),
        listVoiceFiles: () => [...files].map((path) => path.slice("assets/audio/vo/".length)),
        readHash: () => "h",
        durationMs: () => 4500,
        promptMaxMs: 4000,
      },
    });
    expect(problems).toEqual([
      'voice "vo.race.parent.1": the name "Xoài" is only for greetings, invitations and prompts (never praise)',
      'voice "vo.race.parent.1": prompt lasts 4.50 s (at most 4 s, NFR15)',
    ]);
  });
});
