## ADDED Requirements

### Requirement: The cat identity replaces the voice identity icon for dictation only

The pill SHALL render the cat identity when not in agent mode, and SHALL keep rendering `VoiceIdentityIcon` when in agent mode. The cat SHALL be presentational only and SHALL be hidden from assistive technology; the pill's own label carries the accessible state.

#### Scenario: Dictation shows the cat

- **WHEN** the pill renders outside agent mode
- **THEN** the cat identity SHALL be rendered in place of `VoiceIdentityIcon`

#### Scenario: Agent mode keeps the existing icon

- **WHEN** the pill renders in agent mode
- **THEN** `VoiceIdentityIcon` SHALL be rendered and the cat SHALL NOT be

#### Scenario: The cat is not announced

- **WHEN** the cat identity renders
- **THEN** its root and its SVG SHALL be marked `aria-hidden`

### Requirement: The cat carries five voice states

The cat SHALL accept exactly the states `idle`, `hearing`, `recording`, `processing`, and `muted`, each with a distinct pose and motion:

| State | Pose and motion |
| --- | --- |
| `idle` | neutral ears, slow blink, slow tail sway |
| `hearing` | ears swivelled outward and swivelling, head tilting, whiskers twitching, faster tail sway |
| `recording` | ears held outward and tracking the live level, tail flicking |
| `processing` | ears angled back, eyes scanning, head thinking, fast tail flick |
| `muted` | frozen: ears pinned flat, eyes closed with lids drawn, tail dropped, all animation suppressed |

The pill's own states SHALL map onto these: `hover` → `idle` (hover is a pointer cue the pill chrome already carries), `thinking` → `processing`, and `unavailable` → `muted` (a dead mic reads as the shut-down pose, not a false calm).

#### Scenario: Each voice state renders its own pose

- **WHEN** the cat's state changes between `idle`, `hearing`, `recording`, `processing`, and `muted`
- **THEN** the rendered pose and active animations SHALL differ between every pair of those states

#### Scenario: Hover does not get its own cat pose

- **WHEN** the pill state is `hover`
- **THEN** the cat SHALL render the `idle` pose

#### Scenario: An unavailable mic shows the muted pose

- **WHEN** the pill state is `unavailable`
- **THEN** the cat SHALL render the `muted` pose

### Requirement: Muted is distinguished by pose, never by opacity

The muted state SHALL be legible from the cat's silhouette alone. Opacity SHALL NOT be the signal, because the pill dims muted and idle to the same 45%. The muted pose SHALL pin both ears flat, close the eyes with the lids drawn, drop the tail, and suppress every animation.

#### Scenario: Muted and idle are told apart at identical pill opacity

- **GIVEN** the pill renders muted and idle at the same opacity
- **WHEN** the cat renders in each state
- **THEN** the ear angle, eye state, and tail angle SHALL differ between the two
- **AND** the muted cat SHALL have no running animation while the idle cat SHALL blink and sway

### Requirement: The recording ear twitch tracks the live microphone level

In the `recording` state the cat SHALL drive its ear level from the live input level through a single CSS custom property written from an animation-frame loop. The level SHALL be mapped through the waveform's calibrated RMS curve, so the cat and the waveform bars answer to the same loudness. Smoothing SHALL use a fast attack (0.4) and a slow release (0.12), so an ear snaps to a syllable and settles between syllables.

#### Scenario: Only recording runs the level loop

- **WHEN** the cat's state is anything other than `recording`
- **THEN** no animation-frame loop SHALL be scheduled
- **AND** the level custom property SHALL be set to `0`

#### Scenario: Leaving the recording state stops the loop and clears the level

- **GIVEN** the cat is recording and its level loop is running
- **WHEN** the state changes away from `recording`
- **THEN** the animation frame SHALL be cancelled and the level property reset to `0`

#### Scenario: A null level reads as zero rather than failing

- **WHEN** the level source returns `null` during recording
- **THEN** the smoothing target SHALL be `0` and the loop SHALL continue

#### Scenario: The level stays within bounds

- **WHEN** the mapped level falls outside 0..1
- **THEN** the written value SHALL be clamped into 0..1

### Requirement: The cat holds a static pose under reduced motion

With `prefers-reduced-motion: reduce`, every cat animation SHALL be suppressed and each state's pose SHALL be held. The animation suppression SHALL be unconditional rather than relying on the global shortened-keyframe rule, which would snap each loop to its last frame instead of to its pose. The `recording` state SHALL hold a fixed mid-level outward ear swivel (0.55) instead of tracking the signal, so recording stays distinguishable from hearing without motion.

#### Scenario: Reduced motion runs no cat animation

- **GIVEN** the user prefers reduced motion
- **WHEN** the cat renders in any state
- **THEN** no cat animation SHALL run
- **AND** the state's pose SHALL still be applied

#### Scenario: Reduced motion keeps recording distinguishable from hearing

- **GIVEN** the user prefers reduced motion
- **WHEN** the cat's state is `recording`
- **THEN** the ear level SHALL be fixed at 0.55 and no animation-frame loop SHALL be scheduled
- **AND** the resulting ear pose SHALL differ from the `hearing` pose

### Requirement: The cat settles after a prolonged idle period

After **8000 ms** continuously in the `idle` state, the cat SHALL pause its animation loops while holding the idle pose. Any state change SHALL clear the settled condition immediately, so the next transition is animated.

Rationale: the pill is on screen all day; an idle loop that never stops is a battery cost with nothing to show.

#### Scenario: Eight seconds of idle pauses the loops

- **GIVEN** the cat has been `idle` continuously for 8000 ms
- **THEN** its animations SHALL be paused
- **AND** the idle pose SHALL still be rendered

#### Scenario: Leaving idle wakes the cat

- **GIVEN** the cat has settled
- **WHEN** its state changes to any non-idle state
- **THEN** the settled condition SHALL clear before that state renders

#### Scenario: Re-entering idle restarts the settle timer

- **WHEN** the cat returns to `idle` after a dictation
- **THEN** a fresh 8000 ms timer SHALL start before it settles again

### Requirement: The cat silhouette is weighted for the 22px pill

The cat SHALL be drawn in a 24-unit viewBox with a head spanning roughly 12 units and a head stroke weight of 1.7, rather than the full-bleed 18-unit span and weight-2 stroke of the house glyph, so the face does not close up at the pill's 22px identity size. State SHALL be carried primarily by ear angle, because no facial detail survives that size. Every animated transform origin SHALL be declared in viewBox units against the view box, so an animated child cannot drift its parent's origin.

#### Scenario: The ears are the primary state signal

- **WHEN** the cat renders at 22px in each state
- **THEN** the ear angle SHALL differ between `idle`, `hearing`, `recording`, `processing`, and `muted`

#### Scenario: Animated transforms do not drift

- **WHEN** a child element's animation changes a group's bounding box
- **THEN** the transform origins SHALL be unaffected, being resolved against the view box rather than the fill box
