// Voice lines (AD-6, Story 1.3). Every spoken request is a pre-generated warm Vietnamese female
// line (ElevenLabs eleven_v3, voice "Thắm", built by `npm run content:export && npm run tts`).
// Code plays them ONLY by id through core/audio-director (`audio.say(id)`); there is no runtime
// text concatenation, so every combination is enumerated here as its own line.
//
// Rules (checked by content/validate.ts + tools/lint/validate-content.ts):
// - id `vo.<scope>.<intent>[.<subjectId>][.<n>]`, scope = `shell` or a GameId, kebab-case segments;
// - at most 8 words; `|` marks the keyword (no empty segment around it) and then needs
//   `keywordPauseMs` (and vice versa). Since TTS recipe v2 the sentence is spoken whole (natural
//   prosody, no inserted silence); both stay as authoring marks and in the hash;
// Authoring guidance not checked by code: one request per sentence, keyword last.
// - no near-homophone pair (dâu/đâu, cá/cà, ba/bà, bóng/bông, cam/cầm) in one sentence;
// - Story 5.2: the child's name "Xoài" only in greeting/invite/prompt intents (greeting, invite,
//   ask, prompt, scene), never in praise, counts, names, retries or parent lines;
// - `public/<voicePath(id)>` and its `.hash` exist and match `lineHash(line)`.
// A parent approves a line after listening by copying its `.hash` content into `approved.textHash`.
// Type-only imports keep this file runnable by Node type stripping (tools/).
import type { GameId } from './types';

export interface VoiceLine {
  readonly id: string;
  /** Spoken text (NFC). `|` marks the keyword (not spoken; recipe v2 inserts no silence there). */
  readonly text: string;
  readonly keywordPauseMs?: number;
  /**
   * Story 7.4: this line's v3 audio tag instead of VOICE_DEFAULTS.style (e.g. `[softly]` for the bedtime lines). It
   * is part of the line hash (tools/tts/line-hash.ts), so a changed style re-renders the line.
   */
  readonly style?: string;
  /** Speaking rate factor (default VOICE_DEFAULTS.rate). */
  readonly rate?: number;
  /**
   * Story 3.1: why a parent should listen before approving (a loanword or a hard word such as
   * "pizza", "xúc xích"). Required on an unapproved line containing a REVIEW_WORDS phrase
   * (content/validate.ts); validate:content lists these lines.
   */
  readonly review?: string;
  /** Set by a human after listening: the `.hash` content of the approved render. */
  readonly approved?: { readonly textHash: string };
}

/**
 * TTS settings shared by every line (Technical Decisions › Asset pipeline). 2026-10-21: ElevenLabs
 * eleven_v3 with the library voice "Thắm - Giọng Nữ Miền Bắc" (warm young Northern female), chosen
 * by the parent from samples; `style` is the v3 audio tag prefixed to every line.
 */
export const VOICE_DEFAULTS = {
  voice: '0ggMuQ1r9f9jqBu50nJn',
  model: 'eleven_v3',
  style: '[cheerfully]',
  rate: 1,
} as const;

/** Voice scopes: the shell or a mini-game. */
export type VoiceScope = 'shell' | GameId;

export const VOICE_LINES = [
  /** Island greeting: once per session on the first Map entry, with the guide Shiba's wave (Story 5.2). Not yet approved. */
  { id: 'vo.shell.greeting', text: 'Xoài ơi, chơi gì nào?' },
  // Map (Story 1.5). Station names = STATIONS[i].label (content/stations.ts). Not yet approved.
  { id: 'vo.shell.station-name.ice-cream', text: 'Xe kem' },
  { id: 'vo.shell.station-name.pizza', text: 'Tiệm pizza', review: 'loanword "pizza": check the pronunciation' },
  { id: 'vo.shell.station-name.race', text: 'Đường đua' },
  { id: 'vo.shell.station-name.fishing', text: 'Hồ cá' },
  { id: 'vo.shell.station-name.touch-talk', text: 'Chạm là nói' },
  { id: 'vo.shell.station-name.dino-puzzle', text: 'Công viên khủng long' },
  { id: 'vo.shell.station-name.shadow-match', text: 'Hang tìm bóng' },
  /** Map invitation of an awake station (EXPERIENCE › Mời chơi), followed by its name line. */
  { id: 'vo.shell.invite.ice-cream', text: 'Xoài ơi, mình đi ăn | kem nào!', keywordPauseMs: 300 },
  { id: 'vo.shell.invite.pizza', text: 'Xoài ơi, mình làm | pizza nào!', keywordPauseMs: 300, review: 'loanword "pizza": check the pronunciation' },
  { id: 'vo.shell.invite.dino-puzzle', text: 'Xoài ơi, mình ghép | khủng long nào!', keywordPauseMs: 300 },
  { id: 'vo.shell.invite.shadow-match', text: 'Xoài ơi, mình đi | tìm bóng nào!', keywordPauseMs: 300 },
  { id: 'vo.shell.invite.race', text: 'Xoài ơi, mình đi | đua xe nào!', keywordPauseMs: 300 },
  { id: 'vo.shell.invite.fishing', text: 'Xoài ơi, mình đi | câu cá nào!', keywordPauseMs: 300 },
  { id: 'vo.shell.invite.touch-talk', text: 'Xoài ơi, mình đi | chạm là nói nào!', keywordPauseMs: 300 },
  /** Hud Home tap inside a game (Story 1.6). Not yet approved. */
  { id: 'vo.shell.home', text: 'Về đảo nào!' },
  // Story 7.1: the home station "Nhà Xoài" and its yard (content/home.ts). The station name carries the
  // child's name as the place's own name (content/validate.ts › NAME_PLACE_LINES). Not yet approved.
  { id: 'vo.shell.station-name.home', text: 'Nhà Xoài' },
  { id: 'vo.shell.invite.home', text: 'Xoài ơi, mình về | nhà nào!', keywordPauseMs: 300 },
  /** The yard's invitation (on entry) and its Speaker prompt. */
  { id: 'vo.shell.invite.yard', text: 'Xoài ơi, chơi gì ở nhà nào?' },
  /** Hud Home in a game opened from the yard (the yard's own Home says vo.shell.home). */
  { id: 'vo.shell.home.yard', text: 'Về nhà nào!' },
  // The yard corners' names (content/home.ts › YARD_CORNERS labels): said on an awake corner's tap.
  { id: 'vo.shell.corner-name.pen', text: 'Chuồng thú' },
  { id: 'vo.shell.corner-name.stage', text: 'Ban nhạc' },
  { id: 'vo.shell.corner-name.bed', text: 'Giường ngủ' },
  { id: 'vo.shell.corner-name.clinic', text: 'Nhà Shiba' },
  { id: 'vo.shell.corner-name.wardrobe', text: 'Tủ đồ' },
  { id: 'vo.shell.corner-name.garden', text: 'Vườn rau' },
  { id: 'vo.shell.corner-name.car-wash', text: 'Rửa xe' },
  // 2026-11-13 (spec-dao-moi-xe-ra-dao): the rides on the island (content/stations.ts › RIDES): their names (said on a
  // tap, like a station's; the audio of the former yard corner-name lines) and their idle invitations.
  { id: 'vo.shell.station-name.train', text: 'Tàu hỏa' },
  { id: 'vo.shell.station-name.plane', text: 'Máy bay' },
  { id: 'vo.shell.station-name.rocket', text: 'Tên lửa' },
  { id: 'vo.shell.invite.train', text: 'Xoài ơi, mình đi | tàu hỏa nào!', keywordPauseMs: 300 },
  { id: 'vo.shell.invite.plane', text: 'Xoài ơi, mình lái | máy bay nào!', keywordPauseMs: 300 },
  { id: 'vo.shell.invite.rocket', text: 'Xoài ơi, mình bay | lên Mặt Trăng nào!', keywordPauseMs: 300 },
  // Tiệm kem (Story 1.8; 5.2): the single-flavour ask names Xoài — "Xoài ơi, kem … nào!" (+ its colour word: hồng, trắng, xanh); the
  // retry after a wrong scoop. "sô-cô-la" counts as 3 words, so its lines carry no colour word.
  // Played only through core/hint-director. Not yet approved.
  { id: 'vo.ice-cream.ask.strawberry', text: 'Xoài ơi, | kem dâu màu hồng nào!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.chocolate', text: 'Xoài ơi, | kem sô-cô-la nào!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.vanilla', text: 'Xoài ơi, | kem vani màu trắng nào!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.mint', text: 'Xoài ơi, | kem bạc hà màu xanh nào!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.retry.strawberry', text: 'Mình tìm | kem dâu màu hồng nhé!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.retry.chocolate', text: 'Mình tìm | kem sô-cô-la nhé!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.retry.vanilla', text: 'Mình tìm | kem vani màu trắng nhé!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.retry.mint', text: 'Mình tìm | kem bạc hà màu xanh nhé!', keywordPauseMs: 300 },
  // Tiệm kem (Story 1.10): multi-scoop requests name the flavours in FLAVOURS order without colour
  // words (8-word limit); ordered requests (top level) keep the asked order; order-first/order-next
  // name the flavour expected next. Played only through core/hint-director. Not yet approved.
  { id: 'vo.ice-cream.ask.strawberry-chocolate', text: 'Cho Shiba | dâu và sô-cô-la!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.strawberry-vanilla', text: 'Cho Shiba | dâu và vani!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.strawberry-mint', text: 'Cho Shiba | dâu và bạc hà!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.chocolate-vanilla', text: 'Cho Shiba | sô-cô-la và vani!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.chocolate-mint', text: 'Cho Shiba | sô-cô-la và bạc hà!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.vanilla-mint', text: 'Cho Shiba | vani và bạc hà!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.strawberry-chocolate-vanilla', text: 'Cho Shiba | dâu, sô-cô-la, vani!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.strawberry-chocolate-mint', text: 'Cho Shiba | dâu, sô-cô-la, bạc hà!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.strawberry-vanilla-mint', text: 'Cho Shiba | dâu, vani, bạc hà!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask.chocolate-vanilla-mint', text: 'Cho Shiba | sô-cô-la, vani, bạc hà!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.ask-order.strawberry-chocolate-vanilla', text: 'Dâu, rồi sô-cô-la, rồi vani!' },
  { id: 'vo.ice-cream.ask-order.strawberry-chocolate-mint', text: 'Dâu, rồi sô-cô-la, rồi bạc hà!' },
  { id: 'vo.ice-cream.ask-order.strawberry-vanilla-chocolate', text: 'Dâu, rồi vani, rồi sô-cô-la!' },
  { id: 'vo.ice-cream.ask-order.strawberry-vanilla-mint', text: 'Dâu, rồi vani, rồi bạc hà!' },
  { id: 'vo.ice-cream.ask-order.strawberry-mint-chocolate', text: 'Dâu, rồi bạc hà, rồi sô-cô-la!' },
  { id: 'vo.ice-cream.ask-order.strawberry-mint-vanilla', text: 'Dâu, rồi bạc hà, rồi vani!' },
  { id: 'vo.ice-cream.ask-order.chocolate-strawberry-vanilla', text: 'Sô-cô-la, rồi dâu, rồi vani!' },
  { id: 'vo.ice-cream.ask-order.chocolate-strawberry-mint', text: 'Sô-cô-la, rồi dâu, rồi bạc hà!' },
  { id: 'vo.ice-cream.ask-order.chocolate-vanilla-strawberry', text: 'Sô-cô-la, rồi vani, rồi dâu!' },
  { id: 'vo.ice-cream.ask-order.chocolate-vanilla-mint', text: 'Sô-cô-la, rồi vani, rồi bạc hà!' },
  { id: 'vo.ice-cream.ask-order.chocolate-mint-strawberry', text: 'Sô-cô-la, rồi bạc hà, rồi dâu!' },
  { id: 'vo.ice-cream.ask-order.chocolate-mint-vanilla', text: 'Sô-cô-la, rồi bạc hà, rồi vani!' },
  { id: 'vo.ice-cream.ask-order.vanilla-strawberry-chocolate', text: 'Vani, rồi dâu, rồi sô-cô-la!' },
  { id: 'vo.ice-cream.ask-order.vanilla-strawberry-mint', text: 'Vani, rồi dâu, rồi bạc hà!' },
  { id: 'vo.ice-cream.ask-order.vanilla-chocolate-strawberry', text: 'Vani, rồi sô-cô-la, rồi dâu!' },
  { id: 'vo.ice-cream.ask-order.vanilla-chocolate-mint', text: 'Vani, rồi sô-cô-la, rồi bạc hà!' },
  { id: 'vo.ice-cream.ask-order.vanilla-mint-strawberry', text: 'Vani, rồi bạc hà, rồi dâu!' },
  { id: 'vo.ice-cream.ask-order.vanilla-mint-chocolate', text: 'Vani, rồi bạc hà, rồi sô-cô-la!' },
  { id: 'vo.ice-cream.ask-order.mint-strawberry-chocolate', text: 'Bạc hà, rồi dâu, rồi sô-cô-la!' },
  { id: 'vo.ice-cream.ask-order.mint-strawberry-vanilla', text: 'Bạc hà, rồi dâu, rồi vani!' },
  { id: 'vo.ice-cream.ask-order.mint-chocolate-strawberry', text: 'Bạc hà, rồi sô-cô-la, rồi dâu!' },
  { id: 'vo.ice-cream.ask-order.mint-chocolate-vanilla', text: 'Bạc hà, rồi sô-cô-la, rồi vani!' },
  { id: 'vo.ice-cream.ask-order.mint-vanilla-strawberry', text: 'Bạc hà, rồi vani, rồi dâu!' },
  { id: 'vo.ice-cream.ask-order.mint-vanilla-chocolate', text: 'Bạc hà, rồi vani, rồi sô-cô-la!' },
  { id: 'vo.ice-cream.order-first.strawberry', text: 'Trước tiên là | kem dâu!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.order-first.chocolate', text: 'Trước tiên là | kem sô-cô-la!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.order-first.vanilla', text: 'Trước tiên là | kem vani!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.order-first.mint', text: 'Trước tiên là | kem bạc hà!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.order-next.strawberry', text: 'Tiếp theo là | kem dâu!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.order-next.chocolate', text: 'Tiếp theo là | kem sô-cô-la!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.order-next.vanilla', text: 'Tiếp theo là | kem vani!', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.order-next.mint', text: 'Tiếp theo là | kem bạc hà!', keywordPauseMs: 300 },
  // Tiệm pizza (Story 3.1): the fox asks for <n> slices of a topping (prompt, through hint), the retry,
  // the "enough" retry of the oven step, the count of each placed slice (game voice) and the bake prompt.
  // Not yet approved; every "xúc xích" line carries `review` for a parent. Story 3.2 adds counts 4–5,
  // the green bell pepper ("ớt chuông") and the "năm lát nấm" review.
  { id: 'vo.pizza.ask.sausage.1', text: 'Xoài ơi, | một lát xúc xích nào!', keywordPauseMs: 300, review: 'hard word "xúc xích": check the pronunciation' },
  { id: 'vo.pizza.ask.sausage.2', text: 'Xoài ơi, | hai lát xúc xích nào!', keywordPauseMs: 300, review: 'hard word "xúc xích": check the pronunciation' },
  { id: 'vo.pizza.ask.sausage.3', text: 'Xoài ơi, | ba lát xúc xích nào!', keywordPauseMs: 300, review: 'hard word "xúc xích": check the pronunciation' },
  { id: 'vo.pizza.ask.sausage.4', text: 'Xoài ơi, | bốn lát xúc xích nào!', keywordPauseMs: 300, review: 'hard word "xúc xích": check the pronunciation' },
  { id: 'vo.pizza.ask.sausage.5', text: 'Xoài ơi, | năm lát xúc xích nào!', keywordPauseMs: 300, review: 'hard word "xúc xích": check the pronunciation' },
  { id: 'vo.pizza.ask.mushroom.1', text: 'Xoài ơi, | một lát nấm nào!', keywordPauseMs: 300 },
  { id: 'vo.pizza.ask.mushroom.2', text: 'Xoài ơi, | hai lát nấm nào!', keywordPauseMs: 300 },
  { id: 'vo.pizza.ask.mushroom.3', text: 'Xoài ơi, | ba lát nấm nào!', keywordPauseMs: 300 },
  { id: 'vo.pizza.ask.mushroom.4', text: 'Xoài ơi, | bốn lát nấm nào!', keywordPauseMs: 300 },
  {
    id: 'vo.pizza.ask.mushroom.5',
    text: 'Xoài ơi, | năm lát nấm nào!',
    keywordPauseMs: 300,
    review: 'năm/nấm đứng cạnh nhau – nếu nghe lẫn, đổi thành "Xoài ơi, năm lát nhé, | lát nấm nào!"',
  },
  { id: 'vo.pizza.ask.pepper.1', text: 'Xoài ơi, | một lát ớt chuông nào!', keywordPauseMs: 300 },
  { id: 'vo.pizza.ask.pepper.2', text: 'Xoài ơi, | hai lát ớt chuông nào!', keywordPauseMs: 300 },
  { id: 'vo.pizza.ask.pepper.3', text: 'Xoài ơi, | ba lát ớt chuông nào!', keywordPauseMs: 300 },
  { id: 'vo.pizza.ask.pepper.4', text: 'Xoài ơi, | bốn lát ớt chuông nào!', keywordPauseMs: 300 },
  { id: 'vo.pizza.ask.pepper.5', text: 'Xoài ơi, | năm lát ớt chuông nào!', keywordPauseMs: 300 },
  { id: 'vo.pizza.retry.sausage', text: 'Mình lấy | xúc xích nhé!', keywordPauseMs: 300, review: 'hard word "xúc xích": check the pronunciation' },
  { id: 'vo.pizza.retry.mushroom', text: 'Mình lấy | nấm nhé!', keywordPauseMs: 300 },
  { id: 'vo.pizza.retry.pepper', text: 'Mình lấy | ớt chuông nhé!', keywordPauseMs: 300 },
  { id: 'vo.pizza.enough.1', text: 'Đủ một lát rồi!' },
  { id: 'vo.pizza.enough.2', text: 'Đủ hai lát rồi!' },
  { id: 'vo.pizza.enough.3', text: 'Đủ ba lát rồi!' },
  { id: 'vo.pizza.enough.4', text: 'Đủ bốn lát rồi!' },
  { id: 'vo.pizza.enough.5', text: 'Đủ năm lát rồi!' },
  { id: 'vo.pizza.count.1', text: 'Một!' },
  { id: 'vo.pizza.count.2', text: 'Hai!' },
  { id: 'vo.pizza.count.3', text: 'Ba!' },
  { id: 'vo.pizza.count.4', text: 'Bốn!' },
  { id: 'vo.pizza.count.5', text: 'Năm!' },
  { id: 'vo.pizza.bake', text: 'Mình nướng bánh nào!' },
  // Ghép khủng long (Story 3.3): the ask and retry (through hint), and each dino's name when it comes alive (game voice).
  { id: 'vo.dino-puzzle.ask', text: 'Xoài ơi, ghép bạn | khủng long nào!', keywordPauseMs: 300 },
  { id: 'vo.dino-puzzle.retry', text: 'Mình thử | chỗ khác nhé!', keywordPauseMs: 300 },
  { id: 'vo.dino-puzzle.name.apatosaurus', text: 'Khủng long | cổ dài!', keywordPauseMs: 300 },
  { id: 'vo.dino-puzzle.name.triceratops', text: 'Khủng long | ba sừng!', keywordPauseMs: 300 },
  { id: 'vo.dino-puzzle.name.stegosaurus', text: 'Khủng long | phiến lưng!', keywordPauseMs: 300, review: 'coined name "phiến lưng" (back plates): check a child understands it' },
  // Hang tìm bóng (Story 3.5): the ask per held item (through hint; also its retry) and the item's name
  // after its shadow turns real-coloured (game voice). Not yet approved.
  { id: 'vo.shadow-match.ask.dog', text: 'Xoài ơi, bạn chó ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.cow', text: 'Xoài ơi, bạn bò ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.horse', text: 'Xoài ơi, bạn ngựa ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.donkey', text: 'Xoài ơi, bạn lừa ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.stag', text: 'Xoài ơi, bạn nai ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.car', text: 'Xoài ơi, bạn ô tô ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.truck', text: 'Xoài ơi, bạn xe tải ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.tractor', text: 'Xoài ơi, bạn máy cày ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.name.dog', text: 'Con chó!' },
  { id: 'vo.shadow-match.name.cow', text: 'Con bò!' },
  { id: 'vo.shadow-match.name.horse', text: 'Con ngựa!' },
  { id: 'vo.shadow-match.name.donkey', text: 'Con lừa!' },
  { id: 'vo.shadow-match.name.stag', text: 'Con nai!' },
  { id: 'vo.shadow-match.name.car', text: 'Ô tô!' },
  { id: 'vo.shadow-match.name.truck', text: 'Xe tải!' },
  { id: 'vo.shadow-match.name.tractor', text: 'Máy cày!' },
  // 2026-10-22 (spec-tim-bong-hinh-that-them-vat): the 18 new items.
  { id: 'vo.shadow-match.ask.fox', text: 'Xoài ơi, bạn cáo ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.goldfish', text: 'Xoài ơi, bạn cá vàng ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.puffer', text: 'Xoài ơi, bạn cá nóc ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.swordfish', text: 'Xoài ơi, bạn cá kiếm ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.police', text: 'Xoài ơi, xe cảnh sát ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.firetruck', text: 'Xoài ơi, xe cứu hỏa ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.garbage-truck', text: 'Xoài ơi, xe chở rác ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.excavator', text: 'Xoài ơi, máy xúc ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.apple', text: 'Xoài ơi, quả táo ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.banana', text: 'Xoài ơi, quả chuối ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.pineapple', text: 'Xoài ơi, quả dứa ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.pear', text: 'Xoài ơi, quả lê ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.strawberry', text: 'Xoài ơi, quả dâu tây ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.carrot', text: 'Xoài ơi, củ cà rốt ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.mug', text: 'Xoài ơi, cái cốc ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.pan', text: 'Xoài ơi, cái chảo ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.ask.ice-cream', text: 'Xoài ơi, cây kem ở | bóng nào?', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.name.fox', text: 'Con cáo!' },
  { id: 'vo.shadow-match.name.goldfish', text: 'Cá vàng!' },
  { id: 'vo.shadow-match.name.puffer', text: 'Cá nóc!' },
  { id: 'vo.shadow-match.name.swordfish', text: 'Cá kiếm!' },
  { id: 'vo.shadow-match.name.police', text: 'Xe cảnh sát!' },
  { id: 'vo.shadow-match.name.firetruck', text: 'Xe cứu hỏa!' },
  { id: 'vo.shadow-match.name.garbage-truck', text: 'Xe chở rác!' },
  { id: 'vo.shadow-match.name.excavator', text: 'Máy xúc!' },
  { id: 'vo.shadow-match.name.apple', text: 'Quả táo!' },
  { id: 'vo.shadow-match.name.banana', text: 'Quả chuối!' },
  { id: 'vo.shadow-match.name.pineapple', text: 'Quả dứa!' },
  { id: 'vo.shadow-match.name.pear', text: 'Quả lê!' },
  { id: 'vo.shadow-match.name.strawberry', text: 'Quả dâu tây!' },
  { id: 'vo.shadow-match.name.carrot', text: 'Củ cà rốt!' },
  { id: 'vo.shadow-match.name.mug', text: 'Cái cốc!' },
  { id: 'vo.shadow-match.name.pan', text: 'Cái chảo!' },
  { id: 'vo.shadow-match.name.ice-cream', text: 'Cây kem!' },
  // Đường đua (Story 4.1): the prompt of each road (through hint) and its retry. Not yet approved.
  { id: 'vo.race.prompt', text: 'Xoài ơi, lái xe | tới cổng nhé!', keywordPauseMs: 300 },
  { id: 'vo.race.retry', text: 'Đưa ngón theo đường | tới cổng nhé!', keywordPauseMs: 300 },
  // Câu cá (Story 4.3): the prompt and retry per asked colour (through hint) and each fish's name after
  // the catch (game voice). "xanh vây dài", not "vây to": "to" is the size word of Story 4.4. Not yet approved.
  { id: 'vo.fishing.prompt.color-yellow', text: 'Xoài ơi, câu cá | vàng sọc nào!', keywordPauseMs: 300 },
  { id: 'vo.fishing.prompt.color-orange', text: 'Xoài ơi, câu cá | cam chấm nào!', keywordPauseMs: 300 },
  { id: 'vo.fishing.prompt.color-blue', text: 'Xoài ơi, câu cá | xanh vây dài nào!', keywordPauseMs: 300 },
  { id: 'vo.fishing.retry.color-yellow', text: 'Con cá | vàng sọc nhé!', keywordPauseMs: 300 },
  { id: 'vo.fishing.retry.color-orange', text: 'Con cá | cam chấm nhé!', keywordPauseMs: 300 },
  { id: 'vo.fishing.retry.color-blue', text: 'Con cá | xanh vây dài nhé!', keywordPauseMs: 300 },
  // Story 4.4: the size requests ("to" / "nhỏ"). Not yet approved.
  { id: 'vo.fishing.prompt.size-big', text: 'Câu con cá | to nào!', keywordPauseMs: 300 },
  { id: 'vo.fishing.prompt.size-small', text: 'Câu con cá | nhỏ nào!', keywordPauseMs: 300 },
  { id: 'vo.fishing.retry.size-big', text: 'Con cá | to nhé!', keywordPauseMs: 300 },
  { id: 'vo.fishing.retry.size-small', text: 'Con cá | nhỏ nhé!', keywordPauseMs: 300 },
  { id: 'vo.fishing.name.yellow-small', text: 'Cá vàng nhỏ!' },
  { id: 'vo.fishing.name.yellow-big', text: 'Cá vàng to!' },
  { id: 'vo.fishing.name.orange-small', text: 'Cá cam nhỏ!' },
  { id: 'vo.fishing.name.orange-big', text: 'Cá cam to!' },
  { id: 'vo.fishing.name.blue-small', text: 'Cá xanh nhỏ!' },
  { id: 'vo.fishing.name.blue-big', text: 'Cá xanh to!' },
  // Chạm là nói (Story 4.5): each scene's name (the Speaker before any tap) and each prop's name after its
  // sound (game voice). Not yet approved.
  { id: 'vo.touch-talk.scene.sea', text: 'Xoài ơi, | biển!', keywordPauseMs: 300 },
  { id: 'vo.touch-talk.name.boat', text: 'Con thuyền!' },
  { id: 'vo.touch-talk.name.fish', text: 'Con cá!' },
  { id: 'vo.touch-talk.name.crab', text: 'Con cua!' },
  { id: 'vo.touch-talk.name.starfish', text: 'Sao biển!' },
  { id: 'vo.touch-talk.name.parasol', text: 'Cái ô!', review: 'ô/dù: chọn từ quen của bé' },
  { id: 'vo.touch-talk.name.bucket', text: 'Cái xô!' },
  { id: 'vo.touch-talk.name.seagull', text: 'Chim hải âu!' },
  { id: 'vo.touch-talk.name.coconut', text: 'Quả dừa!' },
  { id: 'vo.touch-talk.name.shell', text: 'Vỏ sò!' },
  { id: 'vo.touch-talk.name.beach-ball', text: 'Quả bóng!' },
  // Story 4.6: the street and the kitchen.
  { id: 'vo.touch-talk.scene.street', text: 'Xoài ơi, | đường phố!', keywordPauseMs: 300 },
  { id: 'vo.touch-talk.scene.kitchen', text: 'Xoài ơi, | nhà bếp!', keywordPauseMs: 300 },
  { id: 'vo.touch-talk.name.car', text: 'Ô tô!' },
  { id: 'vo.touch-talk.name.bus', text: 'Xe buýt!' },
  { id: 'vo.touch-talk.name.traffic-light', text: 'Đèn giao thông!' },
  { id: 'vo.touch-talk.name.tree', text: 'Cái cây!' },
  { id: 'vo.touch-talk.name.house', text: 'Ngôi nhà!' },
  { id: 'vo.touch-talk.name.police-car', text: 'Xe cảnh sát!', review: 'cảnh sát/công an' },
  { id: 'vo.touch-talk.name.truck', text: 'Xe tải!' },
  { id: 'vo.touch-talk.name.tractor', text: 'Máy cày!' },
  { id: 'vo.touch-talk.name.dumpster', text: 'Thùng rác!' },
  { id: 'vo.touch-talk.name.cone', text: 'Cọc tiêu!', review: 'cọc tiêu: từ khó, cân nhắc đổi vật' },
  { id: 'vo.touch-talk.name.pot', text: 'Cái nồi!' },
  { id: 'vo.touch-talk.name.frying-pan', text: 'Cái chảo!' },
  { id: 'vo.touch-talk.name.apple', text: 'Quả táo!' },
  { id: 'vo.touch-talk.name.bread', text: 'Bánh mì!' },
  { id: 'vo.touch-talk.name.banana', text: 'Quả chuối!' },
  { id: 'vo.touch-talk.name.carrot', text: 'Củ cà rốt!' },
  { id: 'vo.touch-talk.name.mug', text: 'Cái cốc!', review: 'cốc/ly' },
  { id: 'vo.touch-talk.name.spoon', text: 'Cái thìa!', review: 'thìa/muỗng' },
  { id: 'vo.touch-talk.name.egg', text: 'Quả trứng!' },
  { id: 'vo.touch-talk.name.watermelon', text: 'Quả dưa hấu!' },
  // 2026-10-21 (batch 2): the bathroom, the bakery and the picnic.
  { id: 'vo.touch-talk.scene.bathroom', text: 'Xoài ơi, | phòng tắm!', keywordPauseMs: 300 },
  { id: 'vo.touch-talk.scene.bakery', text: 'Xoài ơi, | tiệm bánh!', keywordPauseMs: 300 },
  { id: 'vo.touch-talk.scene.picnic', text: 'Xoài ơi, | đi dã ngoại!', keywordPauseMs: 300 },
  { id: 'vo.touch-talk.name.bathtub', text: 'Bồn tắm!' },
  { id: 'vo.touch-talk.name.rubber-duck', text: 'Con vịt!' },
  { id: 'vo.touch-talk.name.toothbrush', text: 'Bàn chải!' },
  { id: 'vo.touch-talk.name.toothbrush-cup', text: 'Cái cốc!', review: 'cốc/ly' },
  { id: 'vo.touch-talk.name.towel', text: 'Khăn tắm!' },
  { id: 'vo.touch-talk.name.slippers', text: 'Đôi dép!' },
  { id: 'vo.touch-talk.name.mirror', text: 'Cái gương!' },
  { id: 'vo.touch-talk.name.shampoo', text: 'Dầu gội!' },
  { id: 'vo.touch-talk.name.soap', text: 'Xà phòng!', review: 'xà phòng/xà bông' },
  { id: 'vo.touch-talk.name.potty', text: 'Cái bô!' },
  { id: 'vo.touch-talk.name.birthday-cake', text: 'Bánh sinh nhật!' },
  { id: 'vo.touch-talk.name.cupcake', text: 'Bánh kem nhỏ!' },
  { id: 'vo.touch-talk.name.donut', text: 'Bánh vòng!', review: 'bánh vòng/bánh donut: chọn từ quen của bé' },
  { id: 'vo.touch-talk.name.cookie', text: 'Bánh quy!' },
  { id: 'vo.touch-talk.name.croissant', text: 'Bánh sừng bò!' },
  { id: 'vo.touch-talk.name.muffin', text: 'Bánh nướng!' },
  { id: 'vo.touch-talk.name.waffle', text: 'Bánh tổ ong!' },
  { id: 'vo.touch-talk.name.apple-pie', text: 'Bánh táo!' },
  { id: 'vo.touch-talk.name.cinnamon-roll', text: 'Bánh cuộn!' },
  { id: 'vo.touch-talk.name.chocolate-cake', text: 'Bánh sô-cô-la!', review: 'loanword "sô-cô-la": check the pronunciation' },
  { id: 'vo.touch-talk.name.picnic-basket', text: 'Giỏ đồ ăn!' },
  { id: 'vo.touch-talk.name.sandwich', text: 'Bánh kẹp!' },
  { id: 'vo.touch-talk.name.grapes', text: 'Chùm nho!' },
  { id: 'vo.touch-talk.name.cheese', text: 'Phô mai!', review: 'loanword "phô mai": check the pronunciation' },
  { id: 'vo.touch-talk.name.teapot', text: 'Ấm trà!' },
  { id: 'vo.touch-talk.name.frisbee', text: 'Đĩa bay!' },
  { id: 'vo.touch-talk.name.radio', text: 'Cái đài!', review: 'đài/radio' },
  { id: 'vo.touch-talk.name.cooler', text: 'Thùng đá!' },
  { id: 'vo.touch-talk.name.pillow', text: 'Cái gối!' },
  { id: 'vo.touch-talk.name.butterfly', text: 'Con bướm!' },
  // Story 5.7 (FR35): the parent invitation of each game (content/parent-invite.ts), at most once per
  // round, only at round start (the lead of the first prompt) or in free play. Intent `parent`: never
  // the name "Xoài" (not a NAME_INTENT); length-checked like a prompt. Not yet approved.
  { id: 'vo.ice-cream.parent.1', text: 'Hỏi mẹ xem | mẹ thích kem gì?', keywordPauseMs: 300 },
  { id: 'vo.ice-cream.parent.2', text: 'Mời bố ăn | kem cùng nhé!', keywordPauseMs: 300 },
  { id: 'vo.pizza.parent.1', text: 'Hỏi bố xem | bố thích nấm không?', keywordPauseMs: 300 },
  { id: 'vo.dino-puzzle.parent.1', text: 'Chỉ cho mẹ xem | khủng long nhé!', keywordPauseMs: 300 },
  { id: 'vo.shadow-match.parent.1', text: 'Hỏi mẹ xem | bóng này là gì?', keywordPauseMs: 300 },
  { id: 'vo.race.parent.1', text: 'Chỉ cho bố xem | xe chạy nhé!', keywordPauseMs: 300 },
  { id: 'vo.fishing.parent.1', text: 'Hỏi bố xem | cá nào to nhất?', keywordPauseMs: 300 },
  { id: 'vo.touch-talk.parent.1', text: 'Hỏi mẹ xem | đây là gì nhé!', keywordPauseMs: 300 },
  // Story 7.2 Ú òa chuồng thú (content/games/animal-pens.ts): the invitation as the game opens (`prompt`: its Speaker
  // prompt), each animal's name after its call, one ask per animal (its call in Vietnamese onomatopoeia,
  // never judged), and the parent invitation. Not yet approved.
  { id: 'vo.animal-pens.prompt', text: 'Xoài ơi, ai trốn trong | chuồng nhỉ?', keywordPauseMs: 300 },
  { id: 'vo.animal-pens.name.dog', text: 'Con chó!' },
  { id: 'vo.animal-pens.name.cat', text: 'Con mèo!' },
  { id: 'vo.animal-pens.name.rooster', text: 'Con gà trống!' },
  { id: 'vo.animal-pens.name.cow', text: 'Con bò!' },
  { id: 'vo.animal-pens.name.pig', text: 'Con lợn!' },
  { id: 'vo.animal-pens.name.sheep', text: 'Con cừu!' },
  { id: 'vo.animal-pens.name.horse', text: 'Con ngựa!' },
  { id: 'vo.animal-pens.ask.dog', text: 'Con gì kêu | gâu gâu nhỉ?', keywordPauseMs: 300 },
  { id: 'vo.animal-pens.ask.cat', text: 'Con gì kêu | meo meo nhỉ?', keywordPauseMs: 300 },
  { id: 'vo.animal-pens.ask.rooster', text: 'Con gì kêu | ò ó o nhỉ?', keywordPauseMs: 300, review: 'tiếng gà gáy "ò ó o": nghe lại cách đọc' },
  { id: 'vo.animal-pens.ask.cow', text: 'Con gì kêu | ò ò nhỉ?', keywordPauseMs: 300, review: 'tiếng bò "ò ò": nghe lại cách đọc' },
  { id: 'vo.animal-pens.ask.pig', text: 'Con gì kêu | ụt ịt nhỉ?', keywordPauseMs: 300 },
  { id: 'vo.animal-pens.ask.sheep', text: 'Con gì kêu | be be nhỉ?', keywordPauseMs: 300 },
  { id: 'vo.animal-pens.ask.horse', text: 'Con gì kêu | hí hí nhỉ?', keywordPauseMs: 300 },
  { id: 'vo.animal-pens.parent.1', text: 'Hỏi mẹ xem | con gì đây nhỉ?', keywordPauseMs: 300 },
  // Story 7.3 Ban nhạc (content/games/band.ts): the invitation as the game opens (`prompt`: its Speaker prompt), each
  // instrument's short name for the parent label only (never spoken on a tap: taps play music), and the parent
  // invitation (play together, FR59). Not yet approved.
  { id: 'vo.band.prompt', text: 'Xoài ơi, mình chơi | nhạc nào!', keywordPauseMs: 300 },
  { id: 'vo.band.name.drum', text: 'Cái trống!' },
  { id: 'vo.band.name.horn', text: 'Cái kèn!' },
  { id: 'vo.band.name.frog', text: 'Con ếch!' },
  { id: 'vo.band.name.xylophone', text: 'Đàn gõ!' },
  { id: 'vo.band.name.bell', text: 'Cái chuông!' },
  { id: 'vo.band.parent.1', text: 'Mời bố mẹ | cùng chơi nhạc nhé!', keywordPauseMs: 300 },
  // Giờ đi ngủ (Story 7.4): soft bedtime lines (their own `[softly]` style, not the default `[cheerfully]`): the
  // invitation as a fresh bedtime opens (chained before the first suggestion; every game names Xoài in one prompt), the
  // suggestion of each step (said when the glow moves to it; the Speaker replays it), the goodnight once all three are
  // done, and the parent invitation. Not yet approved.
  { id: 'vo.bedtime.prompt', text: 'Xoài ơi, mình đi ngủ nào.', style: '[softly]' },
  { id: 'vo.bedtime.prompt.brush', text: 'Mình đánh răng cho bạn nào!', style: '[softly]' },
  { id: 'vo.bedtime.prompt.lamp', text: 'Tắt đèn đi ngủ thôi.', style: '[softly]' },
  { id: 'vo.bedtime.prompt.blanket', text: 'Đắp chăn cho bạn nhé.', style: '[softly]' },
  { id: 'vo.bedtime.goodnight', text: 'Chúc bạn ngủ ngon!', style: '[softly]' },
  { id: 'vo.bedtime.parent.1', text: 'Mời bố mẹ | cùng ru bạn ngủ nhé!', keywordPauseMs: 300, style: '[softly]' },
  // Bác sĩ thú cưng (Story 8.1): the invitation as a fresh clinic opens (chained before the first patient's name;
  // it names Xoài), what each problem needs (said as a patient arrives, after a fix while another problem is left, after
  // a tool that fits nothing, and as the idle reminder; the Speaker replays it), the well patient's thank-you (no praise)
  // and the parent invitation. The patient's name reuses vo.animal-pens.name.<id> (the pig is "lợn"). Not yet approved.
  { id: 'vo.pet-clinic.prompt', text: 'Xoài ơi, | có bạn đến khám này!', keywordPauseMs: 300 },
  { id: 'vo.pet-clinic.need.mud', text: 'Bạn bẩn quá, | tắm cho bạn nhé!', keywordPauseMs: 300 },
  { id: 'vo.pet-clinic.need.tummy', text: 'Bạn đói bụng, | cho bạn bú sữa nhé!', keywordPauseMs: 300 },
  { id: 'vo.pet-clinic.need.scrape', text: 'Bạn bị trầy, | dán băng cho bạn nhé!', keywordPauseMs: 300 },
  { id: 'vo.pet-clinic.need.yawn', text: 'Bạn buồn ngủ, | đắp chăn cho bạn nhé.', keywordPauseMs: 300, style: '[softly]' },
  { id: 'vo.pet-clinic.thanks', text: 'Khỏe rồi! | Cảm ơn nhé!', keywordPauseMs: 300 },
  { id: 'vo.pet-clinic.parent.1', text: 'Mời bố mẹ | cùng chữa cho bạn nhé!', keywordPauseMs: 300 },
  // Thay đồ cho Shiba (Story 8.2): the invitation as a fresh wardrobe opens (it names Xoài), one short name line per
  // item said when Shiba puts it on (before the round completes; never praise) and the parent invitation. Not yet approved.
  { id: 'vo.dress-up.prompt', text: 'Xoài ơi, mình thay đồ cho Shiba nào!' },
  { id: 'vo.dress-up.name.party-hat', text: 'Mũ sinh nhật!' },
  { id: 'vo.dress-up.name.cowboy-hat', text: 'Mũ cao bồi!' },
  { id: 'vo.dress-up.name.crown', text: 'Vương miện!' },
  { id: 'vo.dress-up.name.beanie', text: 'Mũ len!' },
  { id: 'vo.dress-up.name.round-glasses', text: 'Kính tròn!' },
  { id: 'vo.dress-up.name.heart-glasses', text: 'Kính trái tim!' },
  { id: 'vo.dress-up.name.star-glasses', text: 'Kính ngôi sao!' },
  { id: 'vo.dress-up.name.striped-tee', text: 'Áo kẻ sọc!' },
  { id: 'vo.dress-up.name.raincoat', text: 'Áo mưa!' },
  { id: 'vo.dress-up.name.heart-jumper', text: 'Áo len trái tim!' },
  { id: 'vo.dress-up.name.flower-shirt', text: 'Áo hoa!' },
  { id: 'vo.dress-up.parent.1', text: 'Hỏi mẹ xem | mẹ thích mũ nào nhé!', keywordPauseMs: 300 },
  // Trồng cây (2026-10-30): the invitation as a fresh garden opens (it names Xoài), one short line per step (choose a
  // seed, water it, pick the fruit; each is also the idle hint and the Speaker prompt), each fruit's name (as its seed is
  // chosen and as its fruits appear) and the parent invitation. No praise. Not yet approved.
  { id: 'vo.garden.prompt', text: 'Xoài ơi, | mình trồng cây nào!', keywordPauseMs: 300 },
  { id: 'vo.garden.choose', text: 'Chọn một gói hạt nhé!' },
  { id: 'vo.garden.water', text: 'Tưới nước cho cây nhé!' },
  { id: 'vo.garden.pick', text: 'Hái quả cho Shiba nhé!' },
  { id: 'vo.garden.name.strawberry', text: 'Quả dâu!' },
  { id: 'vo.garden.name.watermelon', text: 'Quả dưa hấu!' },
  { id: 'vo.garden.name.tomato', text: 'Quả cà chua!' },
  { id: 'vo.garden.name.lemon', text: 'Quả chanh!' },
  { id: 'vo.garden.parent.1', text: 'Mời bố mẹ | cùng trồng cây nhé!', keywordPauseMs: 300 },
  // Rửa xe (2026-10-30): the invitation as the first car arrives (it names Xoài), "rub" (also the idle hint and the
  // Speaker prompt while the car is dirty), "rinse" (once it is foamed), each vehicle's name (as it arrives) and the
  // parent invitation. No praise. Not yet approved.
  { id: 'vo.car-wash.prompt', text: 'Xoài ơi, | mình rửa xe nào!', keywordPauseMs: 300 },
  { id: 'vo.car-wash.rub', text: 'Xoa xà phòng cho xe nhé!' },
  { id: 'vo.car-wash.rinse', text: 'Xịt nước cho xe nhé!' },
  { id: 'vo.car-wash.name.firetruck', text: 'Xe cứu hỏa!' },
  { id: 'vo.car-wash.name.police', text: 'Xe cảnh sát!' },
  { id: 'vo.car-wash.name.ambulance', text: 'Xe cứu thương!' },
  { id: 'vo.car-wash.name.taxi', text: 'Xe taxi!' },
  { id: 'vo.car-wash.name.garbage-truck', text: 'Xe rác!' },
  { id: 'vo.car-wash.name.tractor', text: 'Máy cày!' },
  { id: 'vo.car-wash.parent.1', text: 'Mời bố mẹ | cùng rửa xe nhé!', keywordPauseMs: 300 },
  // Phi công nhí (2026-11-11): the invitation while the plane waits on the grass (it names Xoài; also the idle hint and
  // the Speaker prompt there), "touch the balloons" (after take-off; the idle hint and the Speaker prompt in the air),
  // the colour named as a balloon pops (the count reuses vo.pizza.count.1–3), each friend's "drop the gifts" line (as
  // its house arrives; the idle hint and the Speaker prompt there) and the parent invitation. Naming only: never a
  // question, no praise. Not yet approved.
  { id: 'vo.plane.prompt', text: 'Xoài ơi, | mình lái máy bay nào!', keywordPauseMs: 300 },
  { id: 'vo.plane.balloons', text: 'Chạm vào bóng bay nhé!' },
  { id: 'vo.plane.colour.red', text: 'Bóng đỏ!' },
  { id: 'vo.plane.colour.yellow', text: 'Bóng vàng!' },
  { id: 'vo.plane.colour.green', text: 'Bóng xanh lá!' },
  { id: 'vo.plane.colour.purple', text: 'Bóng tím!' },
  { id: 'vo.plane.drop.cat', text: 'Thả quà cho bạn mèo nhé!' },
  { id: 'vo.plane.drop.pig', text: 'Thả quà cho bạn lợn nhé!' },
  { id: 'vo.plane.drop.sheep', text: 'Thả quà cho bạn cừu nhé!' },
  { id: 'vo.plane.drop.cow', text: 'Thả quà cho bạn bò nhé!' },
  { id: 'vo.plane.drop.horse', text: 'Thả quà cho bạn ngựa nhé!' },
  { id: 'vo.plane.drop.rooster', text: 'Thả quà cho bạn gà nhé!' },
  { id: 'vo.plane.parent.1', text: 'Mời bố mẹ | cùng lái máy bay nhé!', keywordPauseMs: 300 },
  // Tàu hỏa chở bạn (2026-11-12): the invitation at the start station (it names Xoài; also the idle hint and the Speaker
  // prompt there), the station line as the train stops by a waiting friend (the idle hint and the Speaker prompt
  // there), each friend's boarding line (the count reuses vo.pizza.count.1–3), the car colours named on a tap, "Ú òa!"
  // as the engine comes out of the tunnel, each destination's line (said as the train stops there; the idle hint and
  // the Speaker prompt there) and the parent invitation. Naming only: never a question, no praise. Not yet approved.
  { id: 'vo.train.prompt', text: 'Xoài ơi, | chạm tàu cho tàu chạy nhé!', keywordPauseMs: 300 },
  { id: 'vo.train.station', text: 'Có bạn chờ tàu kìa!' },
  { id: 'vo.train.board.cat', text: 'Bạn mèo lên tàu!' },
  { id: 'vo.train.board.pig', text: 'Bạn lợn lên tàu!' },
  { id: 'vo.train.board.sheep', text: 'Bạn cừu lên tàu!' },
  { id: 'vo.train.board.cow', text: 'Bạn bò lên tàu!' },
  { id: 'vo.train.board.horse', text: 'Bạn ngựa lên tàu!' },
  { id: 'vo.train.board.rooster', text: 'Bạn gà lên tàu!' },
  { id: 'vo.train.car.red', text: 'Toa đỏ!' },
  { id: 'vo.train.car.yellow', text: 'Toa vàng!' },
  { id: 'vo.train.car.blue', text: 'Toa xanh dương!' },
  { id: 'vo.train.tunnel', text: 'Ú òa!' },
  { id: 'vo.train.dest.beach', text: 'Đến biển rồi!' },
  { id: 'vo.train.dest.playground', text: 'Đến sân chơi rồi!' },
  { id: 'vo.train.dest.fair', text: 'Đến hội chợ rồi!' },
  { id: 'vo.train.parent.1', text: 'Mời bố mẹ | cùng đi tàu nhé!', keywordPauseMs: 300 },
  // Tên lửa lên Mặt Trăng (2026-11-12): the invitation (names Xoài), each part as it is offered (the idle hint and the
  // Speaker prompt while building), each colour as it is picked, "Phóng!" after the countdown (the numbers reuse
  // vo.pizza.count.3–1), the Earth, the Moon's arrival (the idle hint and the Speaker prompt there), the light jump,
  // "Ú òa!" for a peeking alien, each space surprise, going home and the parent invitation. Naming only: never a
  // question, no praise. Not yet approved.
  { id: 'vo.rocket.prompt', text: 'Xoài ơi, | mình cùng làm tên lửa nhé!', keywordPauseMs: 300 },
  { id: 'vo.rocket.part.body', text: 'Thân tên lửa!' },
  { id: 'vo.rocket.part.nose', text: 'Mũi tên lửa!' },
  { id: 'vo.rocket.part.fins', text: 'Cánh tên lửa!' },
  { id: 'vo.rocket.colour.red', text: 'Màu đỏ!' },
  { id: 'vo.rocket.colour.yellow', text: 'Màu vàng!' },
  { id: 'vo.rocket.colour.blue', text: 'Màu xanh dương!' },
  { id: 'vo.rocket.colour.green', text: 'Màu xanh lá!' },
  { id: 'vo.rocket.colour.white', text: 'Màu trắng!' },
  { id: 'vo.rocket.launch', text: 'Phóng!' },
  { id: 'vo.rocket.earth', text: 'Trái Đất, | nhà của Xoài!', keywordPauseMs: 300 },
  { id: 'vo.rocket.moon', text: 'Đến Mặt Trăng rồi!' },
  { id: 'vo.rocket.light', text: 'Trên Mặt Trăng | nhẹ tênh!', keywordPauseMs: 300 },
  { id: 'vo.rocket.peek', text: 'Ú òa!' },
  { id: 'vo.rocket.surprise.comet', text: 'Sao chổi kìa!' },
  { id: 'vo.rocket.surprise.ringed', text: 'Hành tinh có vòng kìa!' },
  { id: 'vo.rocket.surprise.ufo', text: 'Đĩa bay kìa!' },
  { id: 'vo.rocket.surprise.satellite', text: 'Vệ tinh kìa!' },
  { id: 'vo.rocket.home', text: 'Về nhà thôi!' },
  { id: 'vo.rocket.parent.1', text: 'Bố mẹ | cùng đếm ngược nhé!', keywordPauseMs: 300 },
] as const satisfies readonly VoiceLine[];

export type VoiceLineId = (typeof VOICE_LINES)[number]['id'];

const VOICE_IDS: ReadonlySet<string> = new Set(VOICE_LINES.map((line) => line.id));

export function isVoiceLineId(id: string): id is VoiceLineId {
  return VOICE_IDS.has(id);
}

/** The line that names a station (Map tap on an awake station, after an invitation). */
export function stationNameLine(stationId: string): string {
  return `vo.shell.station-name.${stationId}`;
}

/**
 * The Speaker prompt of the island when Map wakes (Story 1.8): the name of the station the kart is
 * parked at, or none. A game's request never outlives the game.
 */
export function islandPrompt(lastStation: string | undefined): string | undefined {
  if (lastStation === undefined) return undefined;
  const id = stationNameLine(lastStation);
  return isVoiceLineId(id) ? id : undefined;
}

/** The Map invitation line of an awake station. */
export function inviteLine(stationId: string): string {
  return `vo.shell.invite.${stationId}`;
}

/** Shipped file of a line, relative to the app base (`base: './'`). */
export function voicePath(id: string): string {
  return `assets/audio/vo/${id}.m4a`;
}

/** The `.hash` file next to a line's `.m4a`. */
export function voiceHashPath(id: string): string {
  return `assets/audio/vo/${id}.hash`;
}
