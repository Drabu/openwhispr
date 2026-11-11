## ADDED Requirements

### Requirement: Heard speech starts a recording

While the ambient monitor is active, not muted, and no part of the dictation lifecycle is busy, engagement of the ambient hearing gate SHALL start a recording. The recording SHALL be started through the same start path a hotkey uses, flagged as auto-started.

#### Scenario: Speaking into an idle app starts a dictation

- **GIVEN** `ambientIndicatorEnabled` is `true`, the user is not muted, and no dictation is in progress
- **WHEN** the ambient hearing gate engages
- **THEN** a recording SHALL be started with the auto-started flag set
- **AND** the recording SHALL follow the same preparation, transcription, and paste path as a hotkey-started recording

#### Scenario: Muted speech starts nothing

- **GIVEN** the ambient monitor is in muted state
- **WHEN** speech occurs
- **THEN** no recording SHALL be started
- **AND** the hearing gate SHALL report "not hearing", since the monitor is not reading the device

#### Scenario: Speech during a dictation does not start a second one

- **GIVEN** a recording, transcription, or paste is in progress
- **WHEN** the hearing gate would otherwise engage
- **THEN** no additional recording SHALL be started

#### Scenario: A start already in flight is not duplicated

- **GIVEN** a recording start is in flight
- **WHEN** the speech-triggered start condition is evaluated
- **THEN** no second start SHALL be issued

#### Scenario: A state that forbids starting is respected

- **WHEN** the audio manager's current state does not permit starting a dictation
- **THEN** no speech-triggered start SHALL be issued, regardless of the hearing gate

### Requirement: The auto-started flag is set per start and never sticky

The auto-started flag SHALL be written on every recording start, to `true` for a speech-triggered start and to `false` for any hotkey, IPC, or click-initiated start. A recording SHALL NOT inherit the flag from a previous recording.

#### Scenario: A hotkey dictation after a speech-started one is not auto-started

- **GIVEN** the previous recording was speech-triggered
- **WHEN** the user starts the next recording with the dictation hotkey
- **THEN** that recording's auto-started flag SHALL be `false`
- **AND** it SHALL NOT inherit the self-ending contract of the previous recording

#### Scenario: A speech-triggered start sets the flag

- **WHEN** a recording is started by the ambient hearing gate
- **THEN** that recording's auto-started flag SHALL be `true`

### Requirement: Clicking the pill still starts a dictation in ambient mode

Ambient mode SHALL NOT remove the user's ability to start a dictation deliberately. Activating the pill SHALL start a recording through the normal toggle path.

#### Scenario: The pill remains a working dictation control

- **GIVEN** `ambientIndicatorEnabled` is `true` and no dictation is in progress
- **WHEN** the user activates the pill
- **THEN** a recording SHALL start with the auto-started flag `false`

### Requirement: Ambient listening resumes after a speech-triggered dictation completes

After a speech-triggered recording has transcribed and pasted, ambient listening SHALL resume automatically once the settled-idle condition is met, returning the pill to its resting ambient appearance.

#### Scenario: One utterance produces one dictation and then listens again

- **GIVEN** a speech-triggered recording has auto-stopped, transcribed, and pasted
- **WHEN** the idle condition has held for the ambient resume delay
- **THEN** the ambient monitor SHALL be running again
- **AND** the next heard speech SHALL be able to start another recording
