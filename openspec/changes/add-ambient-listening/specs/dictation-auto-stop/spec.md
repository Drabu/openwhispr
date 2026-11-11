## ADDED Requirements

### Requirement: A recording can end itself after a quiet period

When `autoStopOnSilence` is enabled, a live recording that has gone quiet for at least `autoStopSilenceMs` SHALL end itself and proceed through the existing stop path — transcribe, then paste. The auto-stop SHALL be requested through the same stop routine the dictation hotkey invokes, so lifecycle reporting, cues, error handling, and paste behaviour are identical to a manual stop.

#### Scenario: Going quiet finishes the dictation

- **GIVEN** `autoStopOnSilence` is `true` with `autoStopSilenceMs` at 3000
- **AND** a recording has heard speech
- **WHEN** the recording's smoothed level stays below the speech bar for 3000 ms
- **THEN** the recording SHALL stop
- **AND** the audio SHALL be transcribed and pasted by the ordinary path

#### Scenario: Auto-stop is off by default

- **WHEN** the app launches with no stored value for `autoStopOnSilence`
- **THEN** the setting SHALL read `false`
- **AND** a hotkey-started recording SHALL run until the user stops it

### Requirement: A speech-started recording always auto-stops

A recording whose auto-started flag is `true` SHALL auto-stop on silence regardless of the `autoStopOnSilence` setting, because the user pressed nothing that could end it and no other mechanism would.

#### Scenario: Speech-started with the setting disabled still ends itself

- **GIVEN** `autoStopOnSilence` is `false`
- **AND** a recording was started by the ambient hearing gate
- **WHEN** the recording goes quiet for the clamped silence duration
- **THEN** the recording SHALL stop and transcribe

#### Scenario: Hotkey-started with the setting disabled does not end itself

- **GIVEN** `autoStopOnSilence` is `false`
- **AND** a recording was started by the dictation hotkey
- **WHEN** the recording goes quiet indefinitely
- **THEN** the recording SHALL remain live until the user stops it

### Requirement: Silence is judged against a speech-level bar, not the transcription gate

Auto-stop SHALL evaluate silence against `AUTO_STOP_SPEECH_RMS` (0.006 RMS — the ambient hearing gate's exit level) over the recording's own 100 ms level windows, with exponential smoothing (previous × 0.6 + current × 0.4). It SHALL NOT reuse `localSpeechGate`'s speech-window thresholds (rms ≥ 0.003 **and** peak ≥ 0.02).

Rationale: `localSpeechGate` answers "did any sound happen in this recording" once, at the end, to decide whether transcription is worth attempting — a deliberately permissive, fail-open test. Ordinary room noise clears 0.003 rms / 0.02 peak continuously, so a silence timer reset by that gate is reset on nearly every window and never ages to the configured duration. Auto-stop needs "the person stopped talking", which is a higher bar, and the hearing gate's exit level is already calibrated for exactly that transition.

#### Scenario: Room noise does not keep the timer alive

- **GIVEN** a recording has heard speech and the room now carries only background noise measuring below 0.006 smoothed RMS
- **WHEN** the configured silence duration elapses
- **THEN** the recording SHALL auto-stop
- **AND** the fact that the noise would clear `localSpeechGate`'s speech-window thresholds SHALL NOT prevent the stop

#### Scenario: Speech resets the quiet timer

- **GIVEN** a recording is partway through its silence countdown
- **WHEN** a window's smoothed level reaches 0.006 or above
- **THEN** the quiet timer SHALL restart from that moment
- **AND** the recording SHALL remain live

#### Scenario: A single quiet frame mid-word does not read as a pause

- **WHEN** one 100 ms window between syllables measures below the speech bar while the surrounding windows are above it
- **THEN** the smoothed level SHALL stay at or above the bar
- **AND** the quiet timer SHALL NOT start

### Requirement: Auto-stop arms only after real speech

The silence timer SHALL be armed only after the recording has observed at least one window at or above the speech bar. A recording started in a silent room SHALL wait for the user indefinitely rather than stopping immediately. A recording flagged auto-started SHALL be treated as having already heard speech, so its timer arms on the first window.

#### Scenario: A silent room does not end a fresh recording

- **GIVEN** `autoStopOnSilence` is `true`
- **AND** a hotkey-started recording has heard no speech at all
- **WHEN** more than `autoStopSilenceMs` of silence elapses from the start
- **THEN** the recording SHALL remain live

#### Scenario: A speech-started recording arms immediately

- **WHEN** a recording is started by the ambient hearing gate
- **THEN** its silence timer SHALL be armed from the first level window, without waiting for a further above-bar window

### Requirement: Auto-stop fires at most once per recording

An auto-stop request SHALL be issued at most once for any given recording. A later level window SHALL NOT be able to request a second stop. No auto-stop SHALL be requested when the recording is not live.

#### Scenario: A late window cannot request a second stop

- **GIVEN** an auto-stop has already been requested for this recording
- **WHEN** a further quiet level window is measured
- **THEN** no additional stop request SHALL be issued

#### Scenario: No auto-stop outside a live recording

- **WHEN** a level window is evaluated while no recording is live
- **THEN** no auto-stop request SHALL be issued

### Requirement: The silence duration is clamped on read and on write

`autoStopSilenceMs` SHALL be clamped to the inclusive range 1000–30000 ms, rounded to whole milliseconds, with a default of 3000. Clamping SHALL be applied when the stored value is loaded, when the setter is called, and when the value is consumed by the auto-stop evaluation. A non-finite value SHALL resolve to the default.

#### Scenario: A stored value below the floor is raised

- **WHEN** the stored `autoStopSilenceMs` is 250
- **THEN** the effective value SHALL be 1000

#### Scenario: A stored value above the ceiling is lowered

- **WHEN** the stored `autoStopSilenceMs` is 120000
- **THEN** the effective value SHALL be 30000

#### Scenario: A corrupt value falls back to the default

- **WHEN** the stored `autoStopSilenceMs` cannot be parsed as a finite number
- **THEN** the effective value SHALL be 3000

#### Scenario: The settings UI offers only in-range choices

- **WHEN** the user opens the silence-delay control
- **THEN** the offered values SHALL be 2, 3, 5, 8, and 12 seconds
- **AND** the control SHALL be disabled while `autoStopOnSilence` is `false`
