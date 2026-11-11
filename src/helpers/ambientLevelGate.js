// Hysteresis over ambient RMS windows: the pill must not flicker between
// "hearing" and idle on every breath, so rising and falling use different
// thresholds and both need consecutive windows to commit.
//
// These are floors for a quiet room, not the live thresholds. A fixed bar
// cannot separate a voice from a cafe: table chatter sits permanently above
// 0.012, so the gate would read "hearing" forever and the silence timer, which
// hangs off the same calibration, would never age.
const HEARING_RMS_ENTER = 0.012;
const HEARING_RMS_EXIT = 0.006;
const WINDOWS_TO_ENTER = 2;
const WINDOWS_TO_EXIT = 8;

// How far over the room's noise floor a voice must sit. What separates you from
// the next table is distance, not timbre — inverse-square puts a close mic
// several times above the babble, so the ratio is the signal that works where
// an absolute level cannot. Speech detection would not help here: the people
// around you are also speaking.
//
// Set against the number that actually decides this: a conversation at the next
// table reads ~1.5-1.8x the diffuse floor, while your own close mic reads 3x or
// more. The bar belongs just above the former, not near the latter — a margin
// chosen from the inverse-square reading alone lands around 4x and misses
// ordinary speech, which is worse than being merely strict.
//
// The exit margin has to clear the neighbour ratio too, or babble never reads as
// silence and a recording in a cafe runs to the backstop instead of finishing.
export const AMBIENT_NOISE_PROFILES = {
  quiet: { enterMargin: 1.6, exitMargin: 1.2 },
  normal: { enterMargin: 1.9, exitMargin: 1.4 },
  noisy: { enterMargin: 2.3, exitMargin: 1.8 },
};
export const AMBIENT_NOISE_PROFILE_DEFAULT = "normal";

export const resolveAmbientNoiseProfile = (name) =>
  AMBIENT_NOISE_PROFILES[name] ?? AMBIENT_NOISE_PROFILES[AMBIENT_NOISE_PROFILE_DEFAULT];

// The floor follows dips at once and creeps upward (~30s), so it settles on the
// room's steady level rather than on anything said over it. The slow rise is
// what resists speech: an onset moves the floor under 1%, so the bar cannot
// climb away from the voice being measured against it, which is how a quiet
// speaker ends up never crossing it.
//
// Updated on every window, never frozen. Freezing it while the gate hears
// speech cannot work: a cafe is over the absolute enter level continuously, so
// the gate latches on arrival and a floor that only learns while idle stays at
// zero forever — the one room the ratio exists for is the one room it would
// never measure.
const FLOOR_FALL = 0.25;
const FLOOR_RISE = 0.003;

// A cold start learns fast, because 30s of a miscalibrated gate in a loud room
// is 30s of false starts. Hearing is withheld until this is done rather than
// reported from a floor that is still wrong. Skipped when the state is seeded
// from a previous monitor, which is every restart after a dictation.
const PRIME_WINDOWS = 30;
const FLOOR_RISE_PRIME = 0.08;

// Seeded with the floor the room last had: ambient listening is recreated after
// every dictation, and starting back at zero would put the gate on the
// quiet-room bar for the ~5s the floor takes to re-learn — long enough for a
// cafe to trip it the moment a recording ends.
export const createAmbientLevelGateState = (noiseFloor = 0) => {
  const seeded = Math.max(0, noiseFloor || 0);
  return {
    hearing: false,
    aboveCount: 0,
    belowCount: 0,
    smoothedRms: seeded,
    noiseFloor: seeded,
    primeWindows: seeded > 0 ? 0 : PRIME_WINDOWS,
  };
};

// Live thresholds: the quiet-room minimum until the room is louder than it.
const enterThreshold = (floor, profile) => Math.max(HEARING_RMS_ENTER, floor * profile.enterMargin);

const exitThreshold = (floor, profile) => Math.max(HEARING_RMS_EXIT, floor * profile.exitMargin);

// Shared with the silence auto-stop: "stopped talking" has to mean the same
// thing as "not hearing you", or a recording started in a cafe never ends.
export const ambientSpeechThreshold = (noiseFloor, profileName) =>
  exitThreshold(Math.max(0, noiseFloor || 0), resolveAmbientNoiseProfile(profileName));

// Exponential smoothing so one loud transient (a key press) can't trip the gate.
// Kept low enough to still reject a single spike, but every point of inertia
// here is speech lost before the recording starts.
const SMOOTHING = 0.45;

export const recordAmbientWindow = (state, rms, profileName) => {
  if (!state) return null;

  const profile = resolveAmbientNoiseProfile(profileName);
  state.smoothedRms = SMOOTHING * state.smoothedRms + (1 - SMOOTHING) * rms;
  const value = state.smoothedRms;

  const priming = state.primeWindows > 0;
  const rise = priming ? FLOOR_RISE_PRIME : FLOOR_RISE;
  state.noiseFloor += (value - state.noiseFloor) * (value < state.noiseFloor ? FLOOR_FALL : rise);
  if (priming) {
    state.primeWindows -= 1;
    return state;
  }

  if (state.hearing) {
    state.belowCount = value < exitThreshold(state.noiseFloor, profile) ? state.belowCount + 1 : 0;
    if (state.belowCount >= WINDOWS_TO_EXIT) {
      state.hearing = false;
      state.belowCount = 0;
    }
    return state;
  }

  state.aboveCount = value >= enterThreshold(state.noiseFloor, profile) ? state.aboveCount + 1 : 0;
  if (state.aboveCount >= WINDOWS_TO_ENTER) {
    state.hearing = true;
    state.aboveCount = 0;
  }
  return state;
};

export const isAmbientHearing = (state) => Boolean(state?.hearing);

export const ambientNoiseFloor = (state) => state?.noiseFloor ?? 0;

// The dictation pipeline briefly reports nothing busy between the recorder
// stopping and processAudio starting (isStopping clears on isRecording=false,
// isProcessing is not set yet). Resuming ambient listening inside that window
// flashes the pill to idle and takes the mic back mid-pipeline, so the resume
// waits for the lull to prove itself.
export const AMBIENT_RESUME_DELAY_MS = 800;

// Ambient listening holds the device open anyway, so while it runs the mic
// master is held and every consumer takes a clone. Two getUserMedia calls on
// one device is what broke recording start: stopping one and immediately
// opening another hands back a dead track.
export const AMBIENT_HOLD_SECONDS = 900;

// Silence-to-finish bounds. Below ~1s a normal mid-sentence pause ends the
// recording; above 30s the feature stops being an auto-stop at all.
export const AUTO_STOP_SILENCE_MS_MIN = 1000;
export const AUTO_STOP_SILENCE_MS_MAX = 30000;
export const AUTO_STOP_SILENCE_MS_DEFAULT = 3000;

// Backstop for commit-on-hotkey: without the silence timer nothing else ends a
// speech-started recording, and a missed keypress would record indefinitely.
export const AMBIENT_MAX_RECORDING_MS = 120000;

export function clampAutoStopSilenceMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return AUTO_STOP_SILENCE_MS_DEFAULT;
  return Math.min(AUTO_STOP_SILENCE_MS_MAX, Math.max(AUTO_STOP_SILENCE_MS_MIN, Math.round(ms)));
}
