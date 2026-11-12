import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { resolveWaveformBarHeight, WAVEFORM_BAR_MAX_PX, WAVEFORM_BAR_MIN_PX } from "./waveformMath";
import "./CatIdentity.css";

export type CatIdentityState =
  "idle" | "hearing" | "recording" | "processing" | "muted" | "missed" | "submitting" | "sent";

interface CatIdentityProps {
  state: CatIdentityState;
  /** Returns the current input level (0..~1) or null when no signal source exists. */
  getLevel: () => number | null;
  /** Keep the idle loops running instead of settling after REST_AFTER_MS. */
  idleMotion?: boolean;
  size?: number;
  className?: string;
}

// A 24 viewBox, but the head spans 12 units rather than the 18 a full-bleed
// glyph would, so it carries VoiceIdentityIcon's stroke-to-shape ratio at 1.7
// instead of the house weight of 2. Anything heavier closes the face up at 22px.
const HEAD_PATH =
  "M5.7 9.2C5.7 5.9 8.3 4.2 11.6 4.2C14.9 4.2 17.5 5.9 17.5 9.2C17.5 13.1 15 16.2 11.6 16.2C8.2 16.2 5.7 13.1 5.7 9.2Z";
const LEFT_EAR_PATH = "M6 7.2L5.6 1.7L10.6 4.8Z";
const RIGHT_EAR_PATH = "M17.2 7.2L17.6 1.7L12.6 4.8Z";
const NOSE_PATH = "M10.8 12.5H12.4L11.6 13.6Z";
const LEFT_LID_PATH = "M7.6 9.6Q9.2 11.1 10.8 9.6";
const RIGHT_LID_PATH = "M12.4 9.6Q14 11.1 15.6 9.6";
const TAIL_PATH = "M12.4 17.2C15.4 17.7 18 19 19.1 21.5";
const WHISKER_PATHS = [
  "M6.1 11.9L2.5 11.1",
  "M6.7 13.1L2.9 13.8",
  "M17.1 11.9L20.7 11.1",
  "M16.5 13.1L20.3 13.8",
];

// Reuses the waveform's calibrated RMS curve so the cat and the bars answer to
// the same loudness instead of drifting apart.
const toLevel = (rms: number) =>
  (resolveWaveformBarHeight(rms) - WAVEFORM_BAR_MIN_PX) /
  (WAVEFORM_BAR_MAX_PX - WAVEFORM_BAR_MIN_PX);

// Fast attack, slow release: the ears snap to a syllable and settle between
// them, which is what makes the twitch read as a reaction and not as noise.
const LEVEL_ATTACK = 0.4;
const LEVEL_RELEASE = 0.12;
// Reduced motion still needs recording to be told apart from hearing, so the
// ears hold a mid-level outward swivel instead of tracking the signal.
const REDUCED_MOTION_LEVEL = 0.55;
// The pill is on screen all day, so the idle loops eventually stop. Long
// enough that the cat reads as alive while you are at the machine, short
// enough that it is not animating to an empty chair. Any state change wakes it.
const REST_AFTER_MS = 45000;

/**
 * Voice-state cat. The silhouette carries the state at 22px — ear angle above
 * all — because no facial detail survives that size. Everything loops from CSS
 * keyframes except the recording ear twitch, which tracks the live mic level
 * through a single custom property written from a rAF loop.
 */
export function CatIdentity({
  state,
  getLevel,
  idleMotion = false,
  size = 22,
  className,
}: CatIdentityProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [resting, setResting] = useState(false);

  useEffect(() => {
    if (state !== "idle" || idleMotion) {
      setResting(false);
      return undefined;
    }
    const timer = setTimeout(() => setResting(true), REST_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state, idleMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (state !== "recording") {
      root.style.setProperty("--cat-level", "0");
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.style.setProperty("--cat-level", String(REDUCED_MOTION_LEVEL));
      return;
    }

    let frame = 0;
    let smoothed = 0;
    const paint = () => {
      const rms = getLevel();
      const target = rms === null ? 0 : Math.min(1, Math.max(0, toLevel(rms)));
      smoothed += (target - smoothed) * (target > smoothed ? LEVEL_ATTACK : LEVEL_RELEASE);
      root.style.setProperty("--cat-level", smoothed.toFixed(3));
      frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      root.style.setProperty("--cat-level", "0");
    };
  }, [state, getLevel]);

  return (
    <span
      ref={rootRef}
      className={cn("cat-identity relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      data-state={state}
      data-resting={resting || undefined}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="cat-identity-svg absolute inset-0"
        aria-hidden="true"
      >
        <g className="cat-head">
          {/* Ears before the head so the head stroke crosses their bases and the
              two shapes fuse into one silhouette. */}
          <g className="cat-ear-pose" data-side="left">
            <g className="cat-ear-level" data-side="left">
              <path className="cat-ear" data-side="left" d={LEFT_EAR_PATH} fill="currentColor" />
            </g>
          </g>
          <g className="cat-ear-pose" data-side="right">
            <g className="cat-ear-level" data-side="right">
              <path className="cat-ear" data-side="right" d={RIGHT_EAR_PATH} fill="currentColor" />
            </g>
          </g>
          <path
            className="cat-face"
            d={HEAD_PATH}
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <g className="cat-whiskers" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round">
            {WHISKER_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g className="cat-eye-pose" data-side="left">
            <ellipse
              className="cat-eye"
              data-side="left"
              cx="9.2"
              cy="9.9"
              rx="1.15"
              ry="1.45"
              fill="currentColor"
            />
          </g>
          <g className="cat-eye-pose" data-side="right">
            <ellipse
              className="cat-eye"
              data-side="right"
              cx="14"
              cy="9.9"
              rx="1.15"
              ry="1.45"
              fill="currentColor"
            />
          </g>
          <path
            className="cat-lid"
            data-side="left"
            d={LEFT_LID_PATH}
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            className="cat-lid"
            data-side="right"
            d={RIGHT_LID_PATH}
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path className="cat-nose" d={NOSE_PATH} fill="currentColor" />
        </g>
        <path
          className="cat-tail"
          d={TAIL_PATH}
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
