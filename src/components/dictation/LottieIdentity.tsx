import { useEffect, useRef, useState } from "react";
import { DotLottie } from "@lottiefiles/dotlottie-web";
// Bundled, not fetched: the player defaults to a CDN, and a dictation app that
// needs the network to draw its own pill is broken on a plane.
import wasmUrl from "@lottiefiles/dotlottie-web/dotlottie-player.wasm?url";
import identityUrl from "../../assets/voice-identity.lottie?url";
import { cn } from "../lib/utils";
import { resolveWaveformBarHeight, WAVEFORM_BAR_MAX_PX, WAVEFORM_BAR_MIN_PX } from "./waveformMath";
import type { CatIdentityState } from "./CatIdentity";
import logger from "../../utils/logger";
import { ALL_VOICE_IDENTITY_MARKERS, MUTED_HOLD_MARKER } from "../../helpers/voiceIdentityMarkers";

DotLottie.setWasmUrl(wasmUrl);

interface LottieIdentityProps {
  state: CatIdentityState;
  /** Returns the current input level (0..~1) or null when no signal source exists. */
  getLevel: () => number | null;
  /** Keep the idle loops running instead of settling after REST_AFTER_MS. */
  idleMotion?: boolean;
  size?: number;
  className?: string;
}

// Tempo per state, applied on top of whatever the artwork does. Mirrors how the
// cat reads: calm at rest, quicker when it has heard something, driven by the
// signal while recording.
const STATE_SPEED: Record<CatIdentityState, number> = {
  idle: 0.6,
  hearing: 1,
  recording: 1,
  processing: 1.4,
  muted: 1,
  missed: 1,
  submitting: 1,
  sent: 1,
};

// Played once rather than looped: a looping head-shake reads as a stuck
// animation, and muted's artwork is a move into a held pose — the paws lifting
// over the eyes — which only means anything the first time through.
const ONE_SHOT_STATES = new Set<CatIdentityState>(["missed", "muted", "sent"]);
// States whose one-shot is an entrance rather than a reaction: when it finishes
// the player hands over to a looping marker holding the pose it arrived at, so
// the bear carries on dancing with its paws where the entrance put them.
const HOLD_AFTER_ENTRANCE: Partial<Record<CatIdentityState, string>> = {
  muted: MUTED_HOLD_MARKER,
};
// Held on a still frame. Nothing is, currently: submitting used to be, on the
// grounds that the countdown ring was already saying everything — but a bear
// standing dead still under a draining ring reads as a hang, not as waiting.
const FROZEN_STATES = new Set<CatIdentityState>([]);

// Matches CatIdentity: the pill is on screen all day, so idle eventually stops.
const REST_AFTER_MS = 45000;

// Reuses the waveform's calibrated RMS curve, so the identity and the bars
// answer to the same loudness however the artwork chooses to show it.
const toLevel = (rms: number) =>
  (resolveWaveformBarHeight(rms) - WAVEFORM_BAR_MIN_PX) /
  (WAVEFORM_BAR_MAX_PX - WAVEFORM_BAR_MIN_PX);

// A clip cannot be re-posed the way the cat's ears can, so loudness drives
// tempo instead. Floored above zero: a silent frame mid-sentence should slow the
// animation, not stop it dead.
const RECORDING_SPEED_MIN = 0.7;
const RECORDING_SPEED_MAX = 2.2;
const LEVEL_ATTACK = 0.4;
const LEVEL_RELEASE = 0.12;

/**
 * Voice-state identity backed by a .lottie, as an alternative to the drawn cat.
 *
 * The state is carried by named markers in the artwork rather than by code, so
 * everything here is playback: pick the marker, set the tempo, freeze or loop.
 * Anything the states need to look different has to come from the file.
 */
export function LottieIdentity({
  state,
  getLevel,
  idleMotion = false,
  size = 22,
  className,
}: LottieIdentityProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<DotLottie | null>(null);
  const [ready, setReady] = useState(false);
  const [resting, setResting] = useState(false);
  const markersRef = useRef<Set<string>>(new Set());
  const warnedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const player = new DotLottie({
      canvas,
      src: identityUrl,
      autoplay: false,
      loop: true,
      // The player owns the backing-store scaling; sizing the canvas by hand
      // would fight it on a Retina panel.
      renderConfig: { autoResize: true },
    });
    playerRef.current = player;

    const onLoad = () => {
      markersRef.current = new Set((player.markers() ?? []).map((marker) => marker.name));
      const missing = ALL_VOICE_IDENTITY_MARKERS.filter((name) => !markersRef.current.has(name));
      if (missing.length) {
        logger.warn(
          "Voice identity animation is missing markers",
          { missing, found: [...markersRef.current] },
          "ui"
        );
      }
      setReady(true);
    };

    const onLoadError = (event: unknown) => {
      logger.warn("Voice identity animation failed to load", { event }, "ui");
    };

    player.addEventListener("load", onLoad);
    player.addEventListener("loadError", onLoadError);

    return () => {
      player.removeEventListener("load", onLoad);
      player.removeEventListener("loadError", onLoadError);
      player.destroy();
      playerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (state !== "idle" || idleMotion) {
      setResting(false);
      return undefined;
    }
    const timer = setTimeout(() => setResting(true), REST_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state, idleMotion]);

  // Marker, loop mode and tempo all follow the state; the artwork supplies the
  // rest. Reduced motion holds the state's first frame so it is still readable.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = HOLD_AFTER_ENTRANCE[state];
    // Reduced motion never reaches the end of an entrance, so it starts at the
    // destination instead — the hold marker's first frame is the pose the
    // entrance would have arrived at.
    const marker = hold && reduceMotion && markersRef.current.has(hold) ? hold : state;

    if (markersRef.current.has(marker)) {
      player.setMarker(marker);
    } else if (!warnedRef.current) {
      warnedRef.current = true;
      logger.warn("No marker for voice identity state", { state, marker }, "ui");
    }

    player.setLoop(marker !== state || !ONE_SHOT_STATES.has(state));
    player.setSpeed(STATE_SPEED[state]);

    if (FROZEN_STATES.has(state) || resting || reduceMotion) {
      player.pause();
      return;
    }
    player.play();
  }, [state, ready, resting]);

  // Entrance → hold. The entrance plays once and would otherwise stop on its
  // last frame; this moves it onto the looping marker of the same pose, which
  // is seamless because a slot is exactly one cycle long, so the frame it ends
  // on is the frame the hold begins from.
  useEffect(() => {
    const player = playerRef.current;
    const hold = HOLD_AFTER_ENTRANCE[state];
    if (!player || !ready || !hold || !markersRef.current.has(hold)) return undefined;

    const onComplete = () => {
      player.setMarker(hold);
      player.setLoop(true);
      player.play();
    };

    player.addEventListener("complete", onComplete);
    return () => player.removeEventListener("complete", onComplete);
  }, [state, ready]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || state !== "recording") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let smoothed = 0;
    const paint = () => {
      const rms = getLevel();
      const target = rms === null ? 0 : Math.min(1, Math.max(0, toLevel(rms)));
      smoothed += (target - smoothed) * (target > smoothed ? LEVEL_ATTACK : LEVEL_RELEASE);
      player.setSpeed(RECORDING_SPEED_MIN + smoothed * (RECORDING_SPEED_MAX - RECORDING_SPEED_MIN));
      frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      player.setSpeed(STATE_SPEED.recording);
    };
  }, [state, ready, getLevel]);

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      data-state={state}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ width: size, height: size }} className="absolute inset-0" />
    </span>
  );
}
