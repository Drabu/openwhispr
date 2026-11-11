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
];
