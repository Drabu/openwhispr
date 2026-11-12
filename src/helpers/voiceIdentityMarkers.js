// The contract between the pill and its animation: one marker per voice state,
// named exactly this. Kept out of the component so the placeholder generator
// (scripts/build-placeholder-identity-lottie.js) reads the same list — two
// copies would drift the moment a state is added, and the failure is a silent
// frame 0 rather than an error.
//
// Matches CatIdentityState. A real export missing a name is logged by
// LottieIdentity on load rather than guessed at.
export const VOICE_IDENTITY_MARKERS = [
  "idle",
  "hearing",
  "recording",
  "processing",
  "muted",
  "missed",
  "submitting",
  "sent",
];

/**
 * Markers that are not states. A state whose artwork moves into a pose needs a
 * second slot to settle into, because looping its own slot would replay the
 * move — `muted` lifts the paws over the eyes, then hands over to `muted-hold`,
 * which is the same pose already held, dancing on a loop.
 */
export const MUTED_HOLD_MARKER = "muted-hold";
export const VOICE_IDENTITY_HOLD_MARKERS = [MUTED_HOLD_MARKER];

export const ALL_VOICE_IDENTITY_MARKERS = [
  ...VOICE_IDENTITY_MARKERS,
  ...VOICE_IDENTITY_HOLD_MARKERS,
];
