## ADDED Requirements

### Requirement: The ambient monitor and the recorder SHALL never both open the input device

At most one `getUserMedia` call SHALL be outstanding against the microphone at any time across the ambient monitor and the recording path. Both SHALL obtain their stream through the shared capture acquisition, which clones a held master when one exists and only opens the device when it does not.

Rationale — this is the defining bug of this change. Opening a second `getUserMedia` on the same input device while a first stream was live returned a dead track: `startRecording()` returned `false`, no start cue played, and the user received no recording and no error. Stopping one stream and immediately opening another produced the same dead track. The only reliable arrangement is one real device open, shared by clones.

#### Scenario: Starting a dictation while ambient runs opens no second device stream

- **GIVEN** the ambient monitor is running and holds the mic master
- **WHEN** a recording starts
- **THEN** the recording SHALL obtain a clone of the held master
- **AND** no additional `getUserMedia` call SHALL be made for that recording
- **AND** the recording SHALL start successfully with its start cue

#### Scenario: A speech-triggered dictation starts successfully

- **GIVEN** the ambient monitor is running, holds the master, and the hearing gate engages
- **WHEN** the resulting recording starts
- **THEN** `startRecording()` SHALL succeed rather than return `false`

### Requirement: The ambient monitor holds the mic master and reads a clone

While starting, the ambient monitor SHALL ensure a non-zero mic hold is in effect so that its opened stream is adopted as the `MicStreamHold` master and the monitor itself reads a clone. If the user's configured hold is 0 seconds, the monitor SHALL force a hold for the duration of ambient listening and SHALL restore the user's configured value when the monitor is fully stopped.

#### Scenario: A user with mic hold disabled still gets a shared master

- **GIVEN** the user's mic warm-hold is 0 seconds
- **WHEN** the ambient monitor starts
- **THEN** a non-zero hold SHALL be in effect while ambient runs
- **AND** the opened stream SHALL be retained as the master

#### Scenario: Fully stopping the monitor restores the user's hold setting

- **GIVEN** the ambient monitor forced a hold because the user's setting was 0
- **WHEN** the monitor is fully stopped
- **THEN** the user's configured hold value SHALL be restored

#### Scenario: A user who already holds the mic keeps their own value

- **GIVEN** the user's mic warm-hold is already non-zero
- **WHEN** the ambient monitor starts and later stops
- **THEN** the hold value SHALL be left untouched

### Requirement: Releasing ambient capture drops only the clone and keeps the master warm

The release operation SHALL stop the ambient measurement loop, disconnect and close the ambient audio graph, and stop the ambient clone's tracks — and SHALL NOT release the held master. After a release, the master SHALL remain live so the next consumer clones a warm mic rather than reopening the device.

An ambient clone left running would itself keep the device open and defeat the sharing, so the recording path SHALL call this release before acquiring its own stream.

#### Scenario: Release keeps the master available

- **GIVEN** the ambient monitor is running and holds the master
- **WHEN** ambient capture is released
- **THEN** the ambient clone's tracks SHALL be stopped and the ambient context closed
- **AND** the master SHALL remain live and clonable

#### Scenario: Every recording entry point releases the clone first

- **WHEN** a recording is started by hotkey, by IPC, by pill activation, by the dictation-preparation path, or by heard speech
- **THEN** ambient capture SHALL be released before the capture stream is acquired

#### Scenario: Release is idempotent

- **WHEN** ambient capture is released while already released
- **THEN** no error SHALL be raised and no resources SHALL be double-closed

### Requirement: Stopping the ambient monitor releases both the clone and the master

The stop operation SHALL perform the release and additionally restore any forced mic hold, surrendering the master. Stop SHALL be used when ambient listening is being turned off or muted; release SHALL be used when a dictation is taking temporary ownership.

#### Scenario: Disabling the setting surrenders the device entirely

- **WHEN** `ambientIndicatorEnabled` becomes `false`
- **THEN** the monitor SHALL be stopped, not merely released
- **AND** any forced hold SHALL be undone

#### Scenario: Muting surrenders the device entirely

- **WHEN** the renderer enters muted state
- **THEN** the monitor SHALL be stopped, not merely released

#### Scenario: A dictation only releases

- **WHEN** a dictation takes the mic while ambient listening remains enabled and unmuted
- **THEN** ambient capture SHALL be released and the master SHALL be kept warm

### Requirement: Audio-manager cleanup stops the ambient monitor

Tearing down the audio manager SHALL stop the ambient monitor, so no ambient stream, audio context, or measurement interval outlives it.

#### Scenario: Cleanup leaves no ambient resources

- **WHEN** the audio manager is cleaned up while the ambient monitor is running
- **THEN** the monitor SHALL be stopped
- **AND** no ambient interval, stream, or audio context SHALL remain

### Requirement: The ambient monitor reports no level from a stalled context

Ambient level reads SHALL return no value when the ambient audio context is absent or not in the `running` state, so a suspended or dead context is not mistaken for measured silence. The measurement loop SHALL skip windows that yield no value rather than recording them as quiet.

#### Scenario: A suspended context records no windows

- **GIVEN** the ambient audio context is not running
- **WHEN** the measurement loop ticks
- **THEN** no level SHALL be read and no gate window SHALL be recorded

#### Scenario: A stopped monitor reports a null level

- **WHEN** the pill reads the ambient level while the monitor is not running
- **THEN** it SHALL receive `null`
