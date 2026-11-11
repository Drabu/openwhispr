// Hysteresis over ambient RMS windows: the pill must not flicker between
// "hearing" and idle on every breath, so rising and falling use different
// thresholds and both need consecutive windows to commit.
const HEARING_RMS_ENTER = 0.012;
const HEARING_RMS_EXIT = 0.006;
const WINDOWS_TO_ENTER = 2;
const WINDOWS_TO_EXIT = 8;

export const createAmbientLevelGateState = () => ({
  hearing: false,
  aboveCount: 0,
  belowCount: 0,
  smoothedRms: 0,
});

// Exponential smoothing so one loud transient (a key press) can't trip the gate.
// Kept low enough to still reject a single spike, but every point of inertia
// here is speech lost before the recording starts.
const SMOOTHING = 0.45;

export const recordAmbientWindow = (state, rms) => {
  if (!state) return null;

  state.smoothedRms = SMOOTHING * state.smoothedRms + (1 - SMOOTHING) * rms;
  const value = state.smoothedRms;

  if (state.hearing) {
    state.belowCount = value < HEARING_RMS_EXIT ? state.belowCount + 1 : 0;
    if (state.belowCount >= WINDOWS_TO_EXIT) {
      state.hearing = false;
      state.belowCount = 0;
    }
    return state;
  }

  state.aboveCount = value >= HEARING_RMS_ENTER ? state.aboveCount + 1 : 0;
  if (state.aboveCount >= WINDOWS_TO_ENTER) {
    state.hearing = true;
    state.aboveCount = 0;
  }
  return state;
};

export const isAmbientHearing = (state) => Boolean(state?.hearing);

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

// Silence here must mean "stopped talking", not localSpeechGate's permissive
// "any sound happened" bar (rms 0.003 / peak 0.02) — room noise clears that
// continuously, so a timer hung off it never ages. Same calibration as the
// hearing gate, with the lower exit level giving pauses room to breathe.
export const AUTO_STOP_SPEECH_RMS = HEARING_RMS_EXIT;

export function clampAutoStopSilenceMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return AUTO_STOP_SILENCE_MS_DEFAULT;
  return Math.min(AUTO_STOP_SILENCE_MS_MAX, Math.max(AUTO_STOP_SILENCE_MS_MIN, Math.round(ms)));
}
