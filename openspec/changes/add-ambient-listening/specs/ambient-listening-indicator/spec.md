## ADDED Requirements

### Requirement: Ambient listening is opt-in and off by default

The `ambientIndicatorEnabled` setting SHALL default to `false`. While it is `false` the application SHALL NOT open the microphone outside a dictation, the pill SHALL render at full opacity in every state, and the pill's waveform SHALL be driven by recording state alone.

#### Scenario: A fresh install does not hold the mic open

- **WHEN** the app launches with no stored value for `ambientIndicatorEnabled`
- **THEN** the setting SHALL read `false`
- **AND** no ambient capture stream SHALL be opened while the app sits idle
- **AND** `isAmbientMonitorRunning()` SHALL return `false`

#### Scenario: Turning the setting off tears the monitor down

- **WHEN** the ambient monitor is running and the user sets `ambientIndicatorEnabled` to `false`
- **THEN** the monitor SHALL stop, releasing both its clone and the held master
- **AND** the reported hearing state SHALL reset to "not hearing"
- **AND** the pill SHALL return to full opacity

### Requirement: The hearing gate uses hysteresis and cannot flicker

The ambient hearing decision SHALL be made over 100 ms RMS windows with an exponentially smoothed level (smoothing factor 0.6). The gate SHALL engage only after **2** consecutive windows whose smoothed level is at or above **0.012** RMS, and SHALL release only after **8** consecutive windows whose smoothed level is below **0.006** RMS. A window that fails the pending direction SHALL reset that direction's counter to zero.

#### Scenario: A single loud transient does not engage the gate

- **WHEN** one window reports a smoothed level at or above 0.012 and the next window reports a level below it
- **THEN** the gate SHALL remain disengaged
- **AND** the above-threshold counter SHALL reset to zero

#### Scenario: Two sustained windows engage the gate

- **WHEN** two consecutive windows report a smoothed level at or above 0.012
- **THEN** `isAmbientHearing()` SHALL return `true`

#### Scenario: A pause between words does not release the gate

- **GIVEN** the gate is engaged
- **WHEN** fewer than 8 consecutive windows report a smoothed level below 0.006
- **THEN** `isAmbientHearing()` SHALL continue to return `true`

#### Scenario: Release requires eight consecutive quiet windows

- **GIVEN** the gate is engaged
- **WHEN** 8 consecutive windows report a smoothed level below 0.006
- **THEN** `isAmbientHearing()` SHALL return `false`

#### Scenario: Entry and exit thresholds differ

- **WHEN** the smoothed level sits between 0.006 and 0.012
- **THEN** the gate SHALL hold whichever state it was already in, engaging on neither rise nor fall

### Requirement: The pill reports listening state as a brightness ramp

While the ambient monitor is active, the pill SHALL render at **45%** opacity at rest, **45%** opacity while muted, **85%** opacity while the hearing gate is engaged, and **full** opacity while recording. The pill's footprint SHALL NOT change in response to ambient state. Opacity SHALL transition over 220 ms.

#### Scenario: Resting and muted share a brightness

- **WHEN** the pill state is `idle` and ambient is active
- **THEN** the pill SHALL render at 45% opacity
- **AND** when the pill state is `muted` and ambient is active it SHALL render at the same 45% opacity

#### Scenario: Hearing speech lifts the pill without resizing it

- **WHEN** the hearing gate engages
- **THEN** the pill SHALL render at 85% opacity
- **AND** the pill's width and height SHALL be unchanged from its resting ambient size

#### Scenario: Ambient off restores the original chrome

- **WHEN** the ambient monitor is not active
- **THEN** the pill SHALL apply no ambient opacity for any state

### Requirement: The compact pill stays out for the whole ambient session

While the ambient monitor is active, the pill SHALL remain in its compact (waveform-bearing) layout continuously rather than expanding and collapsing per utterance. While ambient is active the resting-silhouette bars and the icon↔waveform divider SHALL be suppressed in favour of the live waveform surface.

#### Scenario: The pill does not expand and contract per utterance

- **GIVEN** the ambient monitor is active and no dictation is in progress
- **WHEN** the hearing gate engages and later releases
- **THEN** the pill SHALL stay in the compact layout throughout
- **AND** the divider SHALL remain hidden in both states

### Requirement: Hover outranks ambient state

A pointer resting on the pill SHALL resolve to the `hover` state in preference to `hearing` or `muted`. Recording and processing SHALL outrank hover.

#### Scenario: Hovering while the pill hears speech shows hover

- **GIVEN** the ambient monitor is active and the hearing gate is engaged
- **WHEN** the pointer enters the pill
- **THEN** the resolved pill state SHALL be `hover`, not `hearing`

#### Scenario: Recording outranks hover

- **GIVEN** the pointer is on the pill
- **WHEN** a recording is in progress
- **THEN** the resolved pill state SHALL be `recording`

### Requirement: The waveform animation loop runs only when there is signal

The pill's waveform SHALL be driven by its animation loop only while recording or while the `hearing` state is active. During ambient silence the waveform SHALL be inactive and SHALL NOT repaint.

#### Scenario: Ambient silence does not repaint the waveform

- **GIVEN** the ambient monitor is active and the hearing gate is disengaged
- **THEN** the waveform SHALL report inactive
- **AND** no per-frame repaint SHALL be scheduled for it

#### Scenario: Hearing speech starts the waveform without a recording

- **WHEN** the hearing gate engages while nothing is recording
- **THEN** the waveform SHALL become active and visible

### Requirement: The pill's level source falls back to the ambient monitor

The level accessor the pill reads SHALL return the recording level when a recording is live, the ambient monitor's level when only the monitor is running, and `null` when neither source exists. The ambient level accessor SHALL return `null` whenever the monitor is not running, so the waveform rests instead of drawing a flat line.

#### Scenario: Between dictations the level comes from the ambient monitor

- **GIVEN** no recording is in progress and the ambient monitor is running
- **WHEN** the pill reads the audio level
- **THEN** it SHALL receive the ambient monitor's current RMS

#### Scenario: With no source the level is null

- **GIVEN** no recording is in progress and the ambient monitor is not running
- **WHEN** the pill reads the audio level
- **THEN** it SHALL receive `null`

### Requirement: Ambient listening yields for the entire dictation lifecycle

The ambient monitor SHALL yield for the whole dictation lifecycle — preparing, recording, stopping, processing, and pasting — and not merely while the recorder is live. Resumption after a dictation SHALL require the idle condition to hold continuously for **800 ms** before the monitor restarts.

#### Scenario: A pasting dictation keeps the pill out of ambient idle

- **GIVEN** a recording has finished and its transcript is still being pasted
- **THEN** the ambient monitor SHALL NOT be running
- **AND** the pill SHALL NOT resolve to an ambient state

#### Scenario: The lull between recorder stop and processing does not resume ambient

- **GIVEN** a recording has just stopped and processing has not yet begun, so no lifecycle flag reads busy
- **WHEN** that condition lasts less than 800 ms before processing begins
- **THEN** the ambient monitor SHALL NOT restart during that window
- **AND** the pill SHALL NOT flash to the ambient idle appearance

#### Scenario: A settled idle period resumes ambient listening

- **GIVEN** `ambientIndicatorEnabled` is `true` and the user is not muted
- **WHEN** no part of the dictation lifecycle has been busy for 800 ms
- **THEN** the ambient monitor SHALL start
- **AND** the pill SHALL resolve to the ambient idle appearance

### Requirement: Ambient monitor startup is single-flight and cancellable

Concurrent calls to start the ambient monitor SHALL share one in-flight start rather than opening the device twice. A release or stop that lands while the capture request is still in flight SHALL win: the resolved stream's tracks SHALL be stopped and the monitor SHALL NOT come up.

#### Scenario: Two start calls open one stream

- **WHEN** the monitor is asked to start twice before the first capture request resolves
- **THEN** exactly one capture stream SHALL be opened
- **AND** both callers SHALL observe the same start outcome

#### Scenario: A stop during startup does not leak a live mic

- **WHEN** the monitor's capture request is in flight and the monitor is released
- **THEN** the resolved stream's tracks SHALL be stopped
- **AND** no measurement interval SHALL be left running

#### Scenario: A failed start leaves nothing behind

- **WHEN** the ambient capture request rejects
- **THEN** the failure SHALL be logged as a warning rather than surfaced as a dictation error
- **AND** every ambient resource SHALL be torn down, including the forced mic hold
