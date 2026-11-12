import React, { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import {
  resolveWaveformBarHeight,
  toBarLevel,
  WAVEFORM_BAR_COUNT,
  WAVEFORM_BAR_MIN_PX,
} from "./waveformMath";

interface PillWaveformProps {
  /** Returns the current input level (0..~1) or null when no signal source exists. */
  getLevel: () => number | null;
  /** While true the bars scroll with live levels; false freezes the captured wave. */
  active: boolean;
  className?: string;
}

// Syllables run ~140-250ms; sampling much faster than that lands neighboring
// bars inside the same syllable, which reads as a fluid ridge. 80ms spacing
// lets adjacent bars straddle syllable onsets and gaps, so the real signal
// itself supplies the bar-to-bar variance.
const SAMPLE_INTERVAL_MS = 80;

// The oldest sample sits at this opacity and the newest at 1, so the lane reads
// left-to-right as a trail rather than as eleven equal sticks.
const RECENCY_MIN = 0.3;
const RECENCY_RANGE = 1 - RECENCY_MIN;
// Peaks thicken. Only on the x axis: height already carries amplitude, and
// scaling both would square the signal and swamp quiet speech.
const PEAK_WIDTH_GAIN = 0.75;

/**
 * Level-driven waveform: bars scroll right-to-left with the live input signal.
 * Heights are written directly to the DOM from a rAF loop so recording never
 * pays React re-render cost. With no signal (getLevel → null) the bars rest at
 * minimum height; when `active` goes false the last captured wave stays frozen.
 */
export function PillWaveform({ getLevel, active, className }: PillWaveformProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const levelsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!active) return;

    // A new recording starts from silence — never replay the previous
    // session's frozen wave.
    levelsRef.current = new Array(WAVEFORM_BAR_COUNT).fill(0);
    for (let index = 0; index < WAVEFORM_BAR_COUNT; index += 1) {
      const bar = barRefs.current[index];
      if (!bar) continue;
      bar.style.height = `${WAVEFORM_BAR_MIN_PX}px`;
      bar.style.transform = "scaleX(1)";
      bar.style.opacity = String(
        RECENCY_MIN + (RECENCY_RANGE * index * 0.6) / (WAVEFORM_BAR_COUNT - 1)
      );
    }

    let frame = 0;
    let lastSample = 0;
    const paint = (now: number) => {
      if (now - lastSample >= SAMPLE_INTERVAL_MS) {
        lastSample = now;
        const level = getLevel();
        const levels = levelsRef.current;
        levels.shift();
        levels.push(level === null ? 0 : level);
        for (let i = 0; i < levels.length; i++) {
          const bar = barRefs.current[i];
          if (!bar) continue;
          bar.style.height = `${resolveWaveformBarHeight(levels[i])}px`;
          // Everything below is the same measured sample read twice more, not
          // decoration: age fades a bar as it scrolls away, and loudness
          // thickens and brightens it. Height alone left eleven identical
          // sticks with no sense of which end was now.
          const age = i / (levels.length - 1);
          const loud = toBarLevel(levels[i]);
          bar.style.opacity = String(RECENCY_MIN + RECENCY_RANGE * age * (0.6 + 0.4 * loud));
          bar.style.transform = `scaleX(${1 + loud * PEAK_WIDTH_GAIN})`;
        }
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [active, getLevel]);

  return (
    <div
      className={cn("flex h-full items-center justify-center gap-0.75", className)}
      aria-hidden="true"
    >
      {Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="w-0.5 origin-center rounded-full bg-current transition-[height,transform,opacity] duration-75 ease-out motion-reduce:transition-none"
          style={{ height: WAVEFORM_BAR_MIN_PX }}
        />
      ))}
    </div>
  );
}
