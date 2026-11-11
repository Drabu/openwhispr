## ADDED Requirements

### Requirement: A dedicated mute hotkey slot exists

The hotkey system SHALL carry a `mute` slot alongside `dictation`, `voiceAgent`, `translation`, and `meeting`. Its binding SHALL persist as `MUTE_KEY`, SHALL be restored and re-registered at launch, and SHALL default to unbound (`""`). The slot SHALL accept at most one hotkey.

#### Scenario: A saved mute hotkey is restored at launch

- **GIVEN** `MUTE_KEY` holds a previously registered hotkey
- **WHEN** the app starts
- **THEN** the `mute` slot SHALL be registered with that hotkey
- **AND** restore failures SHALL be surfaced through the same notification path as the other slots

#### Scenario: No mute hotkey is bound by default

- **WHEN** the app launches with no stored `MUTE_KEY`
- **THEN** the `mute` slot SHALL be unregistered
- **AND** the settings control SHALL show no bound key

#### Scenario: Registering a mute hotkey persists it only on success

- **WHEN** the renderer requests registration of a mute hotkey
- **AND** the registration succeeds
- **THEN** `MUTE_KEY` SHALL be saved and success SHALL be reported
- **AND** when registration fails, `MUTE_KEY` SHALL be left unchanged and the failure reason SHALL be returned

### Requirement: The mute hotkey has hold semantics only

The mute hotkey SHALL act on the key's physical state: held means muted, released means listening. A tap SHALL therefore read as a zero-length mute and leave the monitor listening. There SHALL be no toggle behaviour.

#### Scenario: Holding the key mutes and releasing it resumes

- **GIVEN** a mute hotkey is bound and the ambient monitor is active
- **WHEN** the key is pressed and held
- **THEN** the renderer SHALL enter muted state and the microphone SHALL be released
- **AND** when the key is released, the renderer SHALL leave muted state and the monitor SHALL resume

#### Scenario: A quick tap leaves the monitor listening

- **WHEN** the mute hotkey is pressed and released in quick succession
- **THEN** the resulting muted state SHALL be `false`

### Requirement: Only keys that report a release may be bound to mute

A hotkey SHALL be accepted for the mute slot only if macOS reports its release: a modifier combination (containing `+`), the Globe/`Fn` key, a side mouse button (`MouseButton4`/`MouseButton5`), or a named right-side modifier. A lone regular key SHALL be rejected with a message naming the acceptable alternatives, because such a key goes through `globalShortcut`, which autorepeats and never reports release — a hold bound to it would latch mute on with no way to let go.

This hold-capability test SHALL remain consistent with the main-process push-to-talk test it mirrors.

#### Scenario: A lone letter key is rejected

- **WHEN** the user attempts to bind a lone regular key to the mute slot
- **THEN** validation SHALL fail with the hold-capability message
- **AND** no registration SHALL be attempted

#### Scenario: Acceptable keys pass the hold check

- **WHEN** the candidate is a modifier combination, `GLOBE`, `Fn`, `MouseButton4`, `MouseButton5`, or a right-side modifier
- **THEN** the hold-capability check SHALL pass

#### Scenario: Conflicts are reported before the hold constraint

- **WHEN** the candidate collides with the dictation, meeting, voice-agent, or translation hotkey **and** is also not hold-capable
- **THEN** the conflict message SHALL be reported, not the hold-capability message

### Requirement: The renderer stores the key's reported state rather than toggling it

The main process SHALL report the mute key's physical down and up transitions over the `ambient-mute-hold` channel, and the renderer SHALL assign the received boolean to its muted state. The renderer SHALL NOT invert its own state on each event, so a dropped key-up cannot strand the microphone muted — the next reported state corrects it.

#### Scenario: Repeated down events do not flip the state

- **WHEN** two consecutive "held" reports arrive with no intervening release
- **THEN** the muted state SHALL be `true` after both

#### Scenario: A dropped key-up is corrected by the next report

- **GIVEN** a key-up was not delivered and the renderer is still muted
- **WHEN** the next mute report arrives with "not held"
- **THEN** the muted state SHALL become `false` and the monitor SHALL resume

#### Scenario: The hold channel is not gated by listening mode

- **WHEN** a mute hold transition occurs while the hotkey manager would suppress other dictation messages
- **THEN** the mute hold report SHALL still be delivered to the renderer

### Requirement: Unbinding the mute hotkey clears any live mute

Unregistering the mute hotkey SHALL report "not held" to the renderer, because a key released by unbinding can never report its own key-up and would otherwise leave the microphone muted with nothing bound to release it. The stored `MUTE_KEY` SHALL be cleared and the native key listeners SHALL be reconciled.

#### Scenario: Unbinding while the key is held un-mutes

- **GIVEN** the mute hotkey is held and the renderer is muted
- **WHEN** the mute hotkey is unregistered
- **THEN** the renderer SHALL receive "not held" and leave muted state
- **AND** `MUTE_KEY` SHALL be cleared

#### Scenario: A failed unbind does not clear the stored key

- **WHEN** unregistering the mute slot reports failure
- **THEN** `MUTE_KEY` SHALL be left unchanged and failure SHALL be returned to the renderer

### Requirement: Mute state is session-only

Muted state SHALL NOT be persisted across launches. A restart SHALL always come up unmuted.

#### Scenario: A restart comes up listening

- **GIVEN** the renderer was muted when the app quit
- **WHEN** the app launches again with `ambientIndicatorEnabled` still `true`
- **THEN** the renderer SHALL be unmuted and the ambient monitor SHALL start

### Requirement: Muting releases the microphone but keeps the listening presentation

Entering muted state SHALL stop the ambient monitor, releasing the device. The pill SHALL continue to present as a listening control — dimmed, with its waveform bars frozen — rather than reverting to the non-ambient appearance. The reported hearing state SHALL reset to "not hearing".

#### Scenario: Muting stops the monitor without changing the pill's layout

- **WHEN** the renderer enters muted state while the ambient monitor is running
- **THEN** the monitor SHALL stop and the hearing state SHALL reset to `false`
- **AND** the pill SHALL stay in its compact ambient layout at the muted opacity

### Requirement: The mute hotkey participates in macOS native key listening

The macOS native listener configuration SHALL include the `mute` slot, so Globe/`Fn` and right-side modifiers bound to mute produce down and up events. A Globe-like or right-modifier mute binding SHALL report held on key-down and not-held on key-up, independently of whether the same key drives another slot.

#### Scenario: Globe bound to mute reports both transitions

- **GIVEN** `GLOBE` is bound to the mute slot
- **WHEN** the Globe key is pressed and later released
- **THEN** the renderer SHALL receive "held" then "not held"

#### Scenario: A right-side modifier bound to mute reports both transitions

- **GIVEN** a right-side modifier is bound to the mute slot
- **WHEN** that modifier is pressed and later released
- **THEN** the renderer SHALL receive "held" then "not held"

### Requirement: Mute hotkey strings are localized in every shipped locale

The mute hotkey title, description, and hold-capability validation message SHALL be present in all 11 shipped locales (`ar`, `de`, `en`, `es`, `fr`, `it`, `ja`, `pt`, `ru`, `zh-CN`, `zh-TW`), alongside the auto-stop and ambient-indicator strings.

#### Scenario: Locale key consistency passes

- **WHEN** the i18n consistency check runs
- **THEN** it SHALL report locale keys and placeholders consistent across all shipped locales
