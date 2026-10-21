# Build Auto Workflow

**Goal:** Turn intent into a hardened, reviewable artifact, without human interaction.

**CRITICAL:** If a step directs you to another snapshot file, read it fully and follow it. No exceptions.

## HALT

To HALT with a final status and optional blocking condition:

1. **Folder+id dispatch** (`{spec_folder}` and `{story_id}` are set): the write-back always lands at the id-keyed story spec. The `C:\Users\nguyentrunghieu\Desktop\workspace\play/_bmad-output/implementation-artifacts` fallback in step 2 below is never used in this mode, even for halts before planning starts.
   - If `{spec_file}` is still empty, resolve it now:
     - **Entry not resolved** (`stories.yaml` is missing/unparseable, or `{story_id}` has no matching entry): use the fixed slug segment `unresolved`: `{spec_file}` = `{spec_folder}/stories/{story_id}-unresolved.md`.
     - **Ambiguous on-disk match** (the halt is `ambiguous story file match` — more than one file already matches `{spec_folder}/stories/{story_id}-*.md`): use the fixed slug segment `ambiguous` instead of deriving from the title, so the write-back neither creates a third title-derived candidate nor risks silently landing on one of the existing ambiguous files: `{spec_file}` = `{spec_folder}/stories/{story_id}-ambiguous.md`.
     - **Otherwise** (the entry was resolved and no ambiguous on-disk match exists): derive `{spec_file}` = `{spec_folder}/stories/{story_id}-{slug}.md`, where `{slug}` is a kebab-case slug from `title` (and `description` if needed) with no `{story_id}` prefix — the same derivation step-01's Route uses.
   - If `{spec_file}` exists on disk, update `status` in frontmatter and append missing result details under `## Auto Run Result`.
   - If it does not exist, create it as a skeletal story spec:
     ```markdown
     ---
     status: <final status>
     ---

     # <entry title, or "Story {story_id}" if the entry could not be resolved or the on-disk match was ambiguous>

     ## Auto Run Result

     Status: <final status>
     Blocking condition: <blocking condition, if any>
     ```
2. **Otherwise:**
   - If `{spec_file}` is known and exists, update `status` in frontmatter and append missing result details under `## Auto Run Result`.
   - If `{spec_file}` is unknown or missing, create `C:\Users\nguyentrunghieu\Desktop\workspace\play/_bmad-output/implementation-artifacts/bmad-build-auto-result-<slug-or-timestamp>.md` with:
     ```markdown
     ---
     status: <final status>
     ---

     # BMad Build Auto Result

     Status: <final status>
     Blocking condition: <blocking condition, if any>
     ```
3. Follow **On Complete** below, then stop the workflow.

### On Complete

If anything appears below, follow it as the final terminal instruction before exiting; otherwise exit normally.



## Subagents

Using subagents when instructed is mandatory. If you cannot, HALT with status `blocked` and blocking condition `no subagents`.

Launch all the subagents a step calls for in **one message** — several **blocking** calls awaited together in the same turn — then wait for all their results before continuing; a step that calls for one subagent is that same message with one call. Never split a step's launches across messages, and never run one detached. Never run a subagent in the background / detached / async (e.g. `run_in_background: true`), and never end your turn to "await a completion notification." This workflow runs unattended: there is no event loop to resume a yielded turn, so a backgrounded subagent never hands control back and the run stalls. The only sanctioned way to end a turn is the HALT protocol above with an explicit terminal `status`.

## READY FOR DEVELOPMENT STANDARD

A specification is "Ready for Development" when:

- **Actionable**: Every task has a file path and specific action.
- **Logical**: Tasks ordered by dependency.
- **Testable**: All ACs use Given/When/Then.
- **Surface-anchored**: ACs observe the outermost surface the intent references — never a more internal proxy for it.
- **Complete**: No placeholders or TBDs.
- **Sufficient**: No known requirement, acceptance, dependency, or implementation gaps remain unresolved.
- **Coherent**: No unresolved ambiguities or internal contradictions.

## Conventions

- Every operational cross-file reference in this workflow is an absolute snapshot path. Open it directly; do not resolve it relative to a skill directory.
- `{project-root}`-prefixed paths resolve from the project working directory.
- Whenever this workflow captures or records a version-control revision, obtain the full canonical identifier directly from version control and preserve it verbatim.

## On Activation

### Step 1: Execute Prepend Steps

Execute each of these steps in order before proceeding (`_None._` means skip):

_None._

### Step 2: Load Persistent Facts

Treat every entry below as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs under `{project-root}` -- load the referenced contents as facts. All other entries are facts verbatim (`_None._` means none):

- Story order: work the lowest-numbered story whose sprint-status is 'backlog' (epics 1→4), one story per run. Story files go in _bmad-output/implementation-artifacts as spec-<epic>-<story>-<ascii-kebab-slug>.md; epics file: _bmad-output/planning-artifacts/epics.md.
- No version control: the project is NOT a git repo and must not become one (human decision). Use baseline_commit NO_VCS; build review diffs best-effort with `git diff --no-index /dev/null <file>` over files created/changed by the story (exclude node_modules, dist, package-lock.json, binary assets). Never run git init or commit.
- The app lives in app/ (Phaser 4.2.1 + Vite 8, TypeScript). Every story must pass `cd app && npm run check` (exit 0) before done. Follow ARCHITECTURE-SPINE ADs and the lint layer rules; tools/**/*.ts run directly via Node 24 type stripping.
- Tool paths (the session PATH may be stale; tools must accept env overrides and fall back to PATH): BLENDER_BIN=C:/Program Files/Blender Foundation/Blender 5.2/blender.exe ; FFMPEG_BIN=C:/Users/nguyentrunghieu/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe ; EDGE_TTS_BIN=C:/Users/nguyentrunghieu/.local/bin/edge-tts.exe (edge-tts 7.2.8, voice vi-VN-HoaiMyNeural verified available). Python 3.14 via uv.
- Source 3D assets (CC0): assets/kenney/* (GLB under Models/GLB format/) and assets/quaternius/{dinosaurs,animals,cars,cutefish,food} (FBX; FBX import leaves materials alpha=0 — force Alpha=1/OPAQUE). Approved look: _bmad-output/planning-artifacts/ux-designs/ux-be-hoc-choi-2026-10-08/mockups/ (low-poly toy island, Poly Haven HDRI meadow_2). A reference scene exists at _bmad-output/planning-artifacts/ux-designs/ux-be-hoc-choi-2026-10-08/.working/be-hoc-choi-map-v2.blend; art/*.blend scenes for the app are built by tools/render scripts in Blender CLI (background mode). Poly Haven HDRI may be downloaded once to art/ (CC0) if needed.
- Human decisions (2026-10-08): decoration catalogue for Story 2.2 is AI-chosen (3–5 themed items per station from the Kenney/Quaternius packs, record choices in the spec); target device is a regular iPad / Air / Pro — keep Tokens.safeRect for aspect ≤ 1.46; Story 1.11 prepares PWA config, preview-deploy docs for GitHub Pages and Cloudflare Pages, and the iPad checklist but does NOT deploy anything; no network calls from the shipped app.
- Deferred items to respect: _bmad-output/implementation-artifacts/deferred-work.md (e.g. Story 1.6 should add DOM-level tests for the ScaleManager rotation patch and fix pointer mapping in portrait via core/input/space.ts).
- Auto-run policy: do not stop for intent gaps a sensible default resolves; record the chosen default as a decision in the spec. HALT only for genuinely blocking conditions (missing tool, unrecoverable failure, a destructive or outward-facing action).

### Step 3: Execute Append Steps

Execute each of these steps in order (`_None._` means skip):

_None._

Activation is complete after all activation steps have run.

## Workflow Execution

Follow the step files in order. Read one step fully, execute it, then load the next step only when directed. Do not skip, reorder, or pre-load steps.

## First Workflow Step

Read fully and follow: `C:\Users\nguyentrunghieu\Desktop\workspace\play\_bmad\render\bmad-build-auto\play-9a430fcf0b4a\b690b9fb9b6eadb87454\step-01-clarify-and-route.md`.
