## Status

This change documents work that is **already implemented** in the working tree. The sections below record what landed and, more importantly, what did **not**.

Verified at time of writing:

| Check | Command | Result |
| --- | --- | --- |
| Locale consistency | `npm run i18n:check` | ✓ `[i18n] Locale keys and placeholders are consistent.` |
| Types | `npm run typecheck` | ✓ clean, no output |
| Tests | `node --import tsx --test test/helpers/localSpeechGate.test.js` | ✗ fails — pre-existing harness breakage, see below |

---

## Phase 1 — Ambient level gate [IMPLEMENTED]

- [x] New `src/helpers/ambientLevelGate.js` with hysteresis state: enter 0.012 RMS, exit 0.006, 2 windows to engage, 8 to release, exponential smoothing 0.6.
- [x] `createAmbientLevelGateState()`, `recordAmbientWindow()`, `isAmbientHearing()`.
- [x] `AMBIENT_RESUME_DELAY_MS = 800` — the settled-lull delay that stops ambient resuming inside the false lull between recorder stop and `processAudio` start.
- [x] `AMBIENT_HOLD_SECONDS = 900` — the forced mic hold while ambient runs.
- [x] `AUTO_STOP_SPEECH_RMS` aliased to the hearing gate's exit level (0.006), with the rationale for not reusing `localSpeechGate`'s 0.003 rms / 0.02 peak bar recorded in the source.
- [x] `AUTO_STOP_SILENCE_MS_MIN/MAX/DEFAULT` = 1000 / 30000 / 3000 and `clampAutoStopSilenceMs()`.

## Phase 2 — Ambient monitor in the audio manager [IMPLEMENTED]

- [x] `startAmbientMonitor()` — single-flight via `_ambientStarting`, forces a mic hold when the user's is 0, acquires through `_acquireCaptureStream` so the stream is adopted as the `MicStreamHold` master and the monitor reads a clone, 100 ms measurement interval.
- [x] Cancellation: a release landing while `getUserMedia` is in flight stops the resolved tracks and aborts the start.
- [x] `_readAmbientRms()` returns `null` unless the context is `running`, so a stalled context is not recorded as silence.
- [x] `releaseAmbientCapture()` — drops the clone and the audio graph, keeps the master warm.
- [x] `stopAmbientMonitor()` — release plus restoration of the user's configured mic hold.
- [x] `isAmbientMonitorRunning()`, `getAmbientAudioLevel()` (null when off), `isHearingAmbientSpeech()`.
- [x] `cleanup()` calls `stopAmbientMonitor()`.

## Phase 3 — Auto-stop on silence [IMPLEMENTED]

- [x] `_evaluateSilenceAutoStop(gate, rms)` hung off the existing 100 ms recording level interval, beside `recordLocalSpeechWindow`.
- [x] Smoothing 0.6/0.4; silence judged against `AUTO_STOP_SPEECH_RMS`, not `localSpeechGate`'s thresholds.
- [x] Armed only after a window at or above the speech bar; a speech-started recording arms immediately via `_heardSpeechThisRecording = this._autoStartedByAmbient`.
- [x] Fires at most once per recording (`_autoStopFired`); no-op when not recording.
- [x] `onAutoStopRequested` callback added to the audio-manager callback set; the hook owns the stop so lifecycle reporting stays in one place.
- [x] `setAutoStartedByAmbient()` written per start, never sticky.

## Phase 4 — Renderer wiring [IMPLEMENTED]

- [x] `useAudioRecording.js`: `isHearingAmbient`, `ambientMuted` (not persisted), `ambientMonitorActive`, polled at 120 ms.
- [x] `dictationBusy` spans recording, preparing, processing, stopping, and pasting.
- [x] `ambientLullSettled` gate on `AMBIENT_RESUME_DELAY_MS`.
- [x] Monitor lifecycle effect: stop on disabled or muted, release-only when a dictation owns the mic, start when settled.
- [x] Speech-triggered start effect calling `performStartRecording({ autoStarted: true })`.
- [x] `onAutoStopRequested` routed to `performStopRecording()`.
- [x] `releaseAmbientCapture()` called in `performStartRecording` and in the dictation-preparation IPC path.
- [x] `getAudioLevel` falls back to the ambient level.
- [x] `onAmbientMuteHold` listener assigns the reported boolean rather than toggling.

## Phase 5 — Hold-to-mute hotkey [IMPLEMENTED]

- [x] New `src/helpers/holdCapableHotkey.js` — `isHoldCapableHotkey()` plus the `GLOBE`/`Fn`, mouse-button, and right-side-modifier predicates. Mirrors `lacksMacReleaseSignal()` in `hotkeyManager.js`; both files carry a change-together note.
- [x] `main.js`: `mute` slot startup registration, `register-mute-hotkey` IPC handler, unbind clears the hold, `mute` added to `MAC_NATIVE_HOTKEY_SLOTS`, down/up reporting from both the Globe and the right-modifier listener paths.
- [x] `windowManager.sendAmbientMuteHold(held)` — deliberately ungated by listening mode.
- [x] `preload.js`: `onAmbientMuteHold` listener and `registerMuteHotkey` invoke.
- [x] `environment.js`: `MUTE_KEY` in `PERSISTED_KEYS`, `getMuteKey()` / `saveMuteKey()`.
- [x] `settingsStore.ts`: `muteKey` + `setMuteKey` via `createRegisteredHotkeySetter`.
- [x] `SettingsPage.tsx`: hotkey input with `validateMuteHotkey` (conflict check before the hold constraint), `maxHotkeys={1}`, clear handler.
- [x] **No change needed in `hotkeyManager.js`** — slots are a generic `Map`, so `registerSlot("mute", …)` works unmodified. `LINUX_NATIVE_TAP_SLOTS` deliberately excludes `mute`.

## Phase 6 — Settings and localization [IMPLEMENTED]

- [x] `ambientIndicatorEnabled` (default `false`), `autoStopOnSilence` (default `false`), `autoStopSilenceMs` (default 3000, clamped on read and on write).
- [x] Registered in `BOOLEAN_SETTINGS` / `NUMERIC_SETTINGS`; re-exported through `useSettings.ts`.
- [x] Settings UI: "Finish on silence" panel (toggle + 2/3/5/8/12-second select, disabled when the toggle is off); ambient indicator toggle in the floating-icon panel; hold-to-mute panel.
- [x] All new strings present in all 11 shipped locales — verified with `npm run i18n:check`.

## Phase 7 — Pill and cat [IMPLEMENTED]

- [x] `VoicePillState` extended with `muted` and `hearing`; `ambientActive` prop.
- [x] `AMBIENT_STATE_OPACITY` — idle 0.45, muted 0.45, hearing 0.85; recording and above stay full. `resolvePillOpacity` returns `undefined` when ambient is off, so the non-ambient pill is byte-identical to before.
- [x] Compact pill held out for the whole ambient session; resting silhouette and divider suppressed while ambient is active.
- [x] `waveformLive = isRecording || state === "hearing"` — the waveform loop no longer repaints during ambient silence.
- [x] `App.jsx` state resolution with hover outranking `muted` and `hearing`.
- [x] New `CatIdentity.tsx` / `CatIdentity.css`: five states, pose-based muted distinction, level-driven recording ear twitch through one custom property, reduced-motion static poses with a fixed 0.55 recording ear level, 8 s idle settle that pauses the loops.
- [x] `CAT_STATE` maps `hover` → `idle`, `thinking` → `processing`, `unavailable` → `muted`. Agent mode keeps `VoiceIdentityIcon`.

---

## NOT DONE

These are genuinely outstanding. None of them is blocked by anything in this change.

- [ ] **No automated tests for any of it.** Nothing in this change is covered by a test. The repo's test harness is broken independently of this work: `npm test` runs `node --import tsx --test`, and under Node 24 `tsx` mangles the ESM namespace so imported functions arrive undefined — every test file fails with `TypeError: X is not a function`. Reproduced on an untouched pre-existing file:

  ```
  $ node --import tsx --test test/helpers/localSpeechGate.test.js
  ✖ allows sustained speech-like energy through
    TypeError [Error]: createLocalSpeechGateState is not a function
  ```

  This is pre-existing and unrelated to this change. It does mean the hysteresis gate, the clamp, the hold-capability predicate, and the auto-stop arming logic — all pure functions, all cheap to test — have no coverage. They are the first things to cover once the harness runs.

- [ ] **`prefers-reduced-motion` not verified in a real run.** The CSS suppresses every cat animation unconditionally and the recording ear holds a fixed 0.55 level, but this was never exercised with the OS setting actually on. In particular: whether `recording` and `hearing` are genuinely distinguishable from their static poses alone is reasoned about, not observed. The pill's own 220 ms opacity transition is also not covered by the reduced-motion rule.

- [ ] **Cat legibility at 22px never visually confirmed.** The silhouette was weighted for 22px by argument — 12-unit head span instead of 18, stroke 1.7 instead of the house 2, state carried by ear angle because facial detail will not survive — but no one has looked at it rendered at that size. The muted-vs-idle distinction depends entirely on that reasoning holding, since the two share a pill opacity by design. Needs eyes on all five states at 22px, light and dark.

- [ ] **No i18n beyond the 11 shipped locales.** All 11 shipped locales (`ar`, `de`, `en`, `es`, `fr`, `it`, `ja`, `pt`, `ru`, `zh-CN`, `zh-TW`) **do** carry every new string, including the mute hold-capability validation message — confirmed with `npm run i18n:check` and by reading each file. There is nothing missing here; this entry exists only to record that no locale beyond those 11 is covered, which is the project's existing scope.

- [ ] **Privacy copy not reviewed, and now partly wrong.** The ambient indicator's description reads "Nothing is recorded or transcribed until you press your hotkey." That was true of the indicator alone; it is **false** once the speech-triggered start effect is in the same build, since heard speech starts a real recording that transcribes and pastes. The string needs rewriting in all 11 locales, or the two behaviours need separate settings.

- [ ] **No end-to-end run of the always-listening loop.** The full cycle — ambient hears speech → auto-start → auto-stop on silence → transcribe → paste → ambient resumes after the 800 ms settle — has not been exercised against a real microphone and a real transcription provider. The mic-sharing constraint it depends on is the one that previously failed silently.

## Loose ends found while documenting

- [ ] `AMBIENT_GATE_THRESHOLDS` is exported from `ambientLevelGate.js` and has no consumer anywhere in the tree. Presumably intended for the tests that do not exist yet.
- [ ] `toggleAmbientMute` is returned from `useAudioRecording` and has no consumer; `App.jsx` destructures `ambientMuted` but not the toggle. Either a UI affordance for mute is missing, or the export is dead.
- [ ] A comment in `useAudioRecording.js` states that "in ambient mode the hotkey is the mute switch, not the dictation toggle — only this IPC path is rebound." No code in this change rebinds `onToggleDictation`; the dictation hotkey still toggles dictation in ambient mode. The comment describes intent that was not implemented.
