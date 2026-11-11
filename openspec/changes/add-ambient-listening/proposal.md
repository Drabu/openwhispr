## Why

Dictation was strictly push-to-start: a hotkey opened the mic, a hotkey closed it, and between dictations the microphone was shut and the pill was a dead ornament. That shape has three costs.

1. **No listening feedback.** The user could not tell a working mic from a broken one without starting a recording and reading the transcript afterwards. Every mic fault was discovered after the fact.
2. **Every dictation costs two deliberate acts.** Press to start, press to stop. For short utterances the keypresses outnumber the words.
3. **Nothing can begin on its own.** A hands-free flow (speak, get text, keep working) was unreachable, because starting a recording required a key event.

This change ships always-listening dictation: the mic is held open while idle, the pill reports what it hears, speech itself starts a recording, and silence ends it. All of it is off by default behind `ambientIndicatorEnabled`.

The constraint that shaped the implementation is device exclusivity. Opening a second `getUserMedia` on the same input device while a first stream is live hands back a dead track — `startRecording()` returned `false`, no start chime played, and the user got nothing with no error. An ambient monitor that owns its own mic is therefore in direct conflict with a recorder that opens its own mic. Resolving that is the load-bearing part of this change, not a detail of it.

## What Changes

- **Ambient indicator.** The mic stays open while idle. The pill rests at 45% opacity, lifts to 85% when speech is heard, and goes to full opacity while recording. Hysteresis in `src/helpers/ambientLevelGate.js` (enter 0.012 RMS, exit 0.006, 2 windows to engage, 8 to release, exponential smoothing at 0.6) means the state cannot flicker on a breath or a keystroke.
- **Speech-triggered dictation.** An effect in `useAudioRecording.js` calls `performStartRecording({ autoStarted: true })` when the hearing gate engages and nothing else owns the mic. This is the always-listening core.
- **Auto-stop on silence.** A recording ends itself after a configurable quiet period, then transcribes and pastes through the existing stop path. Default 3000 ms, clamped 1000–30000. A speech-started recording always auto-stops regardless of the setting, because the user never pressed anything that could end it.
- **Hold-to-mute hotkey.** A new `mute` hotkey slot with hold-only semantics. `src/helpers/holdCapableHotkey.js` rejects keys macOS never reports a release for, because a key that cannot report release would latch mute on with no way to let go.
- **Mic stream sharing.** The ambient monitor holds the `MicStreamHold` master and reads a clone. A dictation drops the clone and clones the still-warm master instead of opening the device a second time.
- **Cat identity.** `CatIdentity.tsx` / `.css` replace `VoiceIdentityIcon` for dictation (agent mode keeps the old icon) with an SVG/CSS cat carrying five states: idle, hearing, recording, processing, muted.
- **Battery.** The waveform rAF loop runs only when there is signal to draw; the cat pauses its loops after 8 s of idle.

### Why the auto-stop silence bar is its own threshold

`localSpeechGate` already measures the recording's levels, and reusing it was the obvious move. It does not work. Its bar is "any sound happened" (rms ≥ 0.003 **and** peak ≥ 0.02) and it exists to decide whether a finished recording is worth transcribing at all — a permissive, fail-open test applied once. Ordinary room noise clears that bar continuously, so a silence timer hung off it is reset on nearly every window and never ages past a few hundred milliseconds. Auto-stop therefore judges silence against `AUTO_STOP_SPEECH_RMS` (0.006, the hearing gate's *exit* level), which means "stopped talking" rather than "silent room", and gives mid-sentence pauses room to breathe.

### Why the pill ramps brightness instead of widening

Widening the pill on ambient speech would resize the floating window on every passing sound. Ambient mode instead keeps the compact pill out permanently — the control is meant to read as always listening — and carries state as a brightness ramp. Muted and listening-but-silent deliberately share 45%: both mean "nothing is being said". They are told apart by motion (muted freezes, idle drifts) and by the cat's pose.

## Capabilities

| Capability | Spec |
| --- | --- |
| Ambient listening indicator | `specs/ambient-listening-indicator/spec.md` |
| Speech-triggered dictation | `specs/speech-triggered-dictation/spec.md` |
| Auto-stop on silence | `specs/dictation-auto-stop/spec.md` |
| Hold-to-mute hotkey | `specs/hold-to-mute-hotkey/spec.md` |
| Microphone stream sharing | `specs/mic-stream-sharing/spec.md` |
| Voice identity cat | `specs/voice-identity-cat/spec.md` |

## Impact

**New settings** (all default to the current behaviour):

| Setting | Default | Range |
| --- | --- | --- |
| `ambientIndicatorEnabled` | `false` | boolean |
| `autoStopOnSilence` | `false` | boolean |
| `autoStopSilenceMs` | `3000` | clamped 1000–30000 |
| `muteKey` | `""` (unbound) | hold-capable hotkey |

**Persistence.** `MUTE_KEY` joins `PERSISTED_KEYS` in `environment.js`. `ambientMuted` is deliberately *not* persisted: a mute that survived a restart would leave the mic silently off with no memory of having asked for it.

**Privacy.** With `ambientIndicatorEnabled` on, the mic is open while the app is idle. No audio is retained, transcribed, or sent anywhere from the ambient monitor — it computes an RMS and discards the buffer. The setting's own copy states this. Speech-triggered recordings are ordinary recordings and follow every existing retention and provider rule.

**Mic hold.** While ambient runs, `micStreamHold.holdSeconds` is forced to 900 if the user had it at 0, and restored on `stopAmbientMonitor()`. A user with mic warm-hold disabled therefore gets a held master for as long as ambient listening is on — unavoidable, since ambient already holds the device open.

**Unchanged paths.** With the feature off, `resolvePillOpacity` returns `undefined`, the ambient effect tears down, the waveform's `active` reduces to `isRecording`, and the only residue is the cat replacing `VoiceIdentityIcon` for dictation.

**Files touched.** 23 modified, 4 new (`ambientLevelGate.js`, `holdCapableHotkey.js`, `CatIdentity.tsx`, `CatIdentity.css`). 11 locales carry the new strings.
