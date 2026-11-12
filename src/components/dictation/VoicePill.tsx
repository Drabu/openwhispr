import { forwardRef, useEffect, useRef, type HTMLAttributes } from "react";
import { ChevronUp } from "../icons";
import { cn } from "../lib/utils";
import { PillWaveform } from "./PillWaveform";
import { VoiceIdentityIcon } from "./VoiceIdentityIcon";
import { CatIdentity, type CatIdentityState } from "./CatIdentity";
import { LottieIdentity } from "./LottieIdentity";
import { RESTING_WAVE_SILHOUETTE, WAVEFORM_BAR_COUNT } from "./waveformMath";
import {
  VOICE_PILL_GROW_TRANSITION,
  VOICE_PILL_SCALE,
  scaleVoicePillFootprint,
} from "../../helpers/voicePillPresentation";

export type VoicePillState =
  | "idle"
  | "hover"
  | "muted"
  | "hearing"
  | "missed"
  | "recording"
  | "processing"
  | "thinking"
  | "submitting"
  | "sent"
  | "unavailable";

interface VoicePillProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  variant: "floating" | "panel";
  state: VoicePillState;
  getAudioLevel: () => number | null;
  expanded?: boolean;
  collapseToLogo?: boolean;
  waveformVisible?: boolean;
  waveformOnlyWhileRecording?: boolean;
  integratedWithPanel?: boolean;
  /** The cancel button's liquid skin owns the fused surface; go headless. */
  liquidFused?: boolean;
  agentMode?: boolean;
  showExpandChevron?: boolean;
  isDragging?: boolean;
  horizontalDirection?: "left" | "right";
  /** Ambient mic monitor is running: the pill dims at rest and lifts on speech. */
  ambientActive?: boolean;
  /** Which artwork carries the voice states: the drawn cat, or a .lottie. */
  identityStyle?: "cat" | "lottie";
  /** Keep the idle character and resting wave moving instead of settling. */
  idleMotion?: boolean;
  /** User-chosen size multiplier (VOICE_PILL_SCALE). Every px below derives from it. */
  scale?: number;
  /** The corner grip is being dragged: size transitions off so it tracks the pointer. */
  resizing?: boolean;
  /** When the pending Return fires, as an epoch ms; drives the countdown ring. */
  submitDeadline?: number | null;
  /** The grace period the ring is a fraction of. */
  submitDelayMs?: number;
}

// Sized from WAVEFORM_BAR_COUNT so a bar-count change can never silently
// desync the resting silhouette from the live waveform's footprint.
const RESTING_WAVE_HEIGHTS = Array.from(
  { length: WAVEFORM_BAR_COUNT },
  (_, index) => RESTING_WAVE_SILHOUETTE[index % RESTING_WAVE_SILHOUETTE.length]
);

// Icon↔waveform spacing inside the compact pill. Together with the recording
// footprint and the right-hand padding, centering lands the documented 6/12
// edge insets (VOICE_PILL_FOOTPRINT in voicePillPresentation.js). All of the
// px constants below are at scale 1 and go through `px()`.
const COMPACT_CONTENT_GAP_PX = 6;
const COMPACT_EDGE_PAD_PX = 6;
// Paired with VOICE_PILL_FOOTPRINT's 6px icon inset; changing one without the
// other moves the waveform off the documented edge insets.
const IDENTITY_PX = 68;
const WAVEFORM_SLOT_PX = { width: 52, compactHeight: 24, restingHeight: 32 };
const DIVIDER_PX = { compactHeight: 16, restingHeight: 20 };

// Mirrored by .liquid-cancel-skin[data-pill-state] in dictation-panel.css,
// which redraws this chrome while the cancel skin owns the fused surface —
// change together.
const STATE_APPEARANCE: Record<VoicePillState, string> = {
  idle: "border-border-hover bg-surface-1 text-muted-foreground dark:border-border/50",
  hover: "border-border-hover bg-surface-3 text-foreground",
  muted: "border-border-hover bg-surface-1 text-muted-foreground dark:border-border/50",
  hearing: "border-border-hover bg-surface-2 text-foreground",
  missed: "border-border/60 bg-surface-1 text-muted-foreground",
  recording: "border-border-hover bg-surface-1 text-foreground",
  processing: "border-border/60 bg-surface-1 text-foreground/70",
  thinking: "border-border/60 bg-surface-1 text-foreground",
  submitting: "border-border-hover bg-surface-2 text-foreground",
  sent: "border-border-hover bg-surface-2 text-foreground",
  unavailable: "border-border/60 bg-surface-1 text-muted-foreground",
};

// Ambient listening reads as a brightness ramp, not motion: the pill rests
// dim, lifts when it hears speech, and goes solid once it is actually
// recording. Widening instead would resize the window on every passing sound.
// Only the ambient monitor dims anything — with it off the pill keeps the
// full-opacity chrome it has always had.
// Muted and listening-but-silent share a brightness on purpose: both mean
// "nothing is being said". They are told apart by motion instead — muted
// freezes the bars, idle keeps them drifting.
// Raised with the pill: at 0.45 the resting character was washed out rather
// than restful, and a bigger silhouette only made the faintness more obvious.
// The gap up to the lifted states still carries "it heard something" — it just
// starts from somewhere you can actually read.
const AMBIENT_STATE_OPACITY: Partial<Record<VoicePillState, number>> = {
  idle: 0.62,
  muted: 0.62,
  hearing: 0.92,
  missed: 0.92,
};

// The cat has no hover or agent pose: hover is a pointer cue the chrome already
// carries, and a dead mic reads as the shut-down pose rather than a fake calm.
const CAT_STATE: Record<VoicePillState, CatIdentityState> = {
  idle: "idle",
  hover: "idle",
  muted: "muted",
  hearing: "hearing",
  missed: "missed",
  recording: "recording",
  processing: "processing",
  thinking: "processing",
  submitting: "submitting",
  sent: "sent",
  unavailable: "muted",
};

function resolvePillOpacity(state: VoicePillState, ambientActive: boolean): number | undefined {
  if (!ambientActive) return undefined;
  return AMBIENT_STATE_OPACITY[state];
}

/** One persistent control that resizes between the floating and panel layouts. */
export const VoicePill = forwardRef<HTMLDivElement, VoicePillProps>(function VoicePill(
  {
    variant,
    state,
    getAudioLevel,
    expanded = false,
    collapseToLogo = false,
    waveformVisible = true,
    waveformOnlyWhileRecording = false,
    integratedWithPanel = false,
    liquidFused = false,
    agentMode = false,
    showExpandChevron = false,
    isDragging = false,
    horizontalDirection = "right",
    ambientActive = false,
    identityStyle = "cat",
    idleMotion = true,
    scale = VOICE_PILL_SCALE.default,
    resizing = false,
    submitDeadline = null,
    submitDelayMs = 0,
    className,
    style,
    ...props
  },
  ref
) {
  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const isThinking = state === "thinking";
  const isUnavailable = state === "unavailable";
  const countdownRef = useRef<HTMLSpanElement>(null);
  const submitActive = state === "submitting" && !!submitDeadline && submitDelayMs > 0;

  // Driven from the deadline rather than a CSS animation of fixed length: the
  // grace period is a setting, and a dropped frame must show the time actually
  // left instead of lagging the keystroke it is warning about.
  useEffect(() => {
    const ring = countdownRef.current;
    if (!ring) return;
    if (!submitActive) {
      ring.style.setProperty("--submit-remaining", "0");
      return;
    }

    let frame = 0;
    const paint = () => {
      const remaining = (submitDeadline - Date.now()) / submitDelayMs;
      ring.style.setProperty("--submit-remaining", Math.min(1, Math.max(0, remaining)).toFixed(4));
      frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      ring.style.setProperty("--submit-remaining", "0");
    };
  }, [submitActive, submitDeadline, submitDelayMs]);
  // One Signal glow (comet orbit over a breathing halo) serves both
  // identities; only the palette differs. It lights for the real thinking
  // state alone — glowing during the entrance or while listening would read
  // as work already in flight before any transcript exists.
  const showSignalGlow = !isUnavailable && isThinking;
  const isPanel = variant === "panel";
  const collapseToIdentity = collapseToLogo || isThinking;
  // Only when there is signal to draw. Ambient listening sat at 60fps repainting
  // flat bars all day; silence shows the resting silhouette, which costs nothing.
  const waveformLive = isRecording || state === "hearing";
  // Widening is tied to having something to show. Holding the wide footprint
  // through ambient silence left an empty slot, since waveformVisible is false
  // outside the listening entrance and nothing drew in it.
  const showCompactPill =
    !collapseToIdentity && (waveformLive || expanded || (isPanel && !waveformOnlyWhileRecording));
  const showDivider = showCompactPill && waveformVisible && !waveformLive;
  const footprints = scaleVoicePillFootprint(scale);
  const px = (value: number) => Math.round(value * scale);
  // The hidden divider's margins are what carry the compact pill's 6px
  // icon↔waveform gap; a visible divider keeps 4px flanking its 1px rule.
  const dividerMargin = showCompactPill ? px(showDivider ? 4 : COMPACT_CONTENT_GAP_PX / 2) : 0;
  const identitySize = px(IDENTITY_PX);
  // Bar geometry (widths, gaps, the calibrated height curve) is shared with the
  // live waveform's math, so the lane is scaled as a whole rather than
  // re-derived per bar. Both are CSS boxes, so the transform stays crisp.
  const waveLaneScale =
    scale === 1 ? undefined : { transform: `scale(${scale})`, transformOrigin: "center" };
  const floatingHover = !isPanel && state === "hover";
  const footprint = showCompactPill ? footprints.recording : footprints.idle;
  // The resting pill is the character alone on the desktop. The capsule chrome
  // only appears when it frames something: the listening/recording waveform,
  // or the work states whose Signal glow and countdown ring are drawn on that
  // boundary. The Agent pill keeps its own chrome throughout.
  const framesWork = isProcessing || isThinking || state === "submitting" || state === "sent";
  const chromeless = !agentMode && !showCompactPill && !framesWork;

  const pill = (
    <div
      ref={ref}
      className={cn(
        "voice-pill-control relative flex items-center justify-center overflow-hidden rounded-full border",
        "shadow-[var(--shadow-card)]",
        STATE_APPEARANCE[state],
        className
      )}
      style={{
        // Listening uses the same compact pill as the idle state. The previous
        // wide recording bar made the control feel like a different surface
        // and forced an unnecessary large window resize.
        width: footprint.width,
        height: footprint.height,
        paddingRight: showCompactPill ? px(COMPACT_EDGE_PAD_PX) : 0,
        cursor: isProcessing || isThinking ? "not-allowed" : isDragging ? "grabbing" : "pointer",
        // Yields to the fused rule's `box-shadow: none` while the liquid skin
        // owns the chrome — an inline shadow would outrank it and paint a
        // phantom capsule when a de-fusing skin lingers over a hovered pill.
        boxShadow:
          floatingHover && !liquidFused && !chromeless
            ? "var(--shadow-card-hover-subtle)"
            : undefined,
        opacity: resolvePillOpacity(state, ambientActive),
        // Under a live grip drag the box must land where the pointer is; a
        // 300ms tween on width/height would trail it by a third of a second.
        transition: resizing
          ? "background-color 220ms ease-out, border-color 220ms ease-out, box-shadow 220ms ease-out, opacity 220ms ease-out"
          : `width ${VOICE_PILL_GROW_TRANSITION}, height ${VOICE_PILL_GROW_TRANSITION}, padding-left ${VOICE_PILL_GROW_TRANSITION}, padding-right ${VOICE_PILL_GROW_TRANSITION}, background-color 220ms ease-out, border-color 220ms ease-out, box-shadow 220ms ease-out, opacity 220ms ease-out`,
        ...style,
      }}
      data-horizontal-direction={horizontalDirection}
      data-integrated-with-panel={integratedWithPanel || undefined}
      data-liquid-fused={liquidFused || undefined}
      data-chromeless={chromeless || undefined}
      data-wave-frozen={state === "muted" || isUnavailable || !idleMotion || undefined}
      data-agent-mode={agentMode || undefined}
      data-agent-beam-active={(agentMode && isThinking) || undefined}
      data-expand-chevron={showExpandChevron || undefined}
      {...props}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-foreground/10 to-transparent transition-opacity duration-200 ease-out"
        // Without chrome this wash is the only thing a hover would draw, and a
        // tinted disc behind the character is the circle we just removed.
        style={{ opacity: state === "hover" && !chromeless ? 0.72 : 0 }}
      />

      <span
        className="voice-pill-identity-slot relative inline-block shrink-0 transition-[width,height] duration-200"
        style={{
          width: identitySize,
          height: identitySize,
          transitionProperty: resizing ? "none" : undefined,
        }}
        aria-hidden="true"
      >
        <span
          className={cn(
            "voice-pill-identity-logo absolute inset-0 transition-[opacity,transform] duration-200 ease-out",
            showExpandChevron ? "translate-y-1 scale-75 opacity-0" : "scale-100 opacity-100"
          )}
        >
          {agentMode ? (
            <VoiceIdentityIcon
              size={identitySize}
              agentMode={agentMode}
              className={cn(
                "transition-[width,height] duration-200",
                state === "idle" && "text-foreground",
                (isUnavailable || isProcessing) && "animate-pulse"
              )}
            />
          ) : (
            (() => {
              const Identity = identityStyle === "lottie" ? LottieIdentity : CatIdentity;
              return (
                <Identity
                  state={CAT_STATE[state]}
                  getLevel={getAudioLevel}
                  idleMotion={idleMotion}
                  size={identitySize}
                  // No pulse on processing: both identities animate that state
                  // themselves.
                  className={cn(
                    !resizing && "transition-[width,height] duration-200",
                    state === "idle" && "text-foreground",
                    isUnavailable && "animate-pulse"
                  )}
                />
              );
            })()
          )}
        </span>
        <ChevronUp
          className={cn(
            "voice-pill-expand-chevron absolute inset-0 m-auto size-5 transition-[opacity,transform] duration-200 ease-out",
            showExpandChevron ? "scale-100 opacity-100" : "translate-y-1 scale-75 opacity-0"
          )}
          strokeWidth={2}
        />
      </span>

      <div
        className="shrink-0 overflow-hidden bg-border/60"
        style={{
          height: px(showCompactPill ? DIVIDER_PX.compactHeight : DIVIDER_PX.restingHeight),
          width: showDivider ? Math.max(1, Math.round(scale)) : 0,
          marginLeft: dividerMargin,
          marginRight: dividerMargin,
          opacity: showDivider ? 1 : 0,
          transition: `width ${VOICE_PILL_GROW_TRANSITION}, margin ${VOICE_PILL_GROW_TRANSITION}, opacity 180ms ease-out`,
        }}
      />

      <div
        className="voice-pill-waveform relative shrink-0 overflow-hidden text-foreground"
        style={{
          width: showCompactPill ? px(WAVEFORM_SLOT_PX.width) : 0,
          height: px(
            showCompactPill ? WAVEFORM_SLOT_PX.compactHeight : WAVEFORM_SLOT_PX.restingHeight
          ),
          transition: `width ${VOICE_PILL_GROW_TRANSITION}, height ${VOICE_PILL_GROW_TRANSITION}`,
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center gap-0.75 transition-opacity duration-200 ease-out"
          style={{
            opacity: showCompactPill && waveformVisible && !waveformLive ? 1 : 0,
            ...waveLaneScale,
          }}
          aria-hidden="true"
        >
          {RESTING_WAVE_HEIGHTS.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className="voice-pill-resting-bar w-0.5 origin-center rounded-full bg-current"
              // Staggered by index so the drift travels along the lane instead
              // of every bar breathing in unison, which reads as a pulse.
              style={{ height, animationDelay: `${index * 0.14}s` }}
            />
          ))}
        </div>
        <div className="absolute inset-0" style={waveLaneScale}>
          <PillWaveform
            getLevel={getAudioLevel}
            active={waveformLive}
            className={cn(
              "absolute inset-0 transition-opacity duration-200 ease-out",
              showCompactPill && waveformVisible && waveformLive ? "opacity-100" : "opacity-0"
            )}
          />
        </div>
      </div>

      {isUnavailable && (
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-foreground/30 animate-pulse" />
      )}
    </div>
  );

  return (
    <span className="voice-pill-glow-anchor">
      <span
        aria-hidden="true"
        className="processing-signal-glow"
        data-active={showSignalGlow ? "true" : undefined}
        data-agent={agentMode || undefined}
      >
        <span className="processing-signal-ring" />
      </span>
      <span
        ref={countdownRef}
        aria-hidden="true"
        className="submit-countdown-ring"
        data-active={submitActive ? "true" : undefined}
      />
      {pill}
    </span>
  );
});
