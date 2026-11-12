import { useRef, type RefObject } from "react";
import { cn } from "../lib/utils";
import { VOICE_PILL_SCALE, clampVoicePillScale } from "../../helpers/voicePillPresentation";

interface PillResizeGripProps {
  scale: number;
  /** Which window edge the pill is docked against; the opposite corner carries the grip. */
  dock: "left" | "right" | "center";
  /** The pill itself, measured at drag start to find the corner that stays put. */
  pillRef: RefObject<HTMLElement | null>;
  /** The pill's current box, to seat the grip on its rounded end. */
  pillWidth: number;
  pillHeight: number;
  visible: boolean;
  /** Shown above the grip while dragging; null hides it. */
  readout: string | null;
  /** Live, uncommitted size while the pointer is down. */
  onPreview: (scale: number) => void;
  /** Persisted once the pointer is released; the pointer's last position comes
   *  with it because a drag suppresses the pill's own hover tracking. */
  onCommit: (scale: number, pointer: { x: number; y: number }) => void;
  label: string;
}

/** Below this the start radius is too small for the ratio to be stable. */
const MIN_START_RADIUS_PX = 12;

/**
 * Seats the grip on the capsule's rounded end at the up-diagonal, rather than
 * at the corner of its bounding box — the resting pill is a circle, so that
 * corner is a good 13px clear of anything drawn. Staying inside the box also
 * keeps the grip inside the pill row's hover region, which is what fades it in.
 */
const rimInset = (pillHeight: number) => (pillHeight / 2) * (1 - 1 / Math.SQRT2);

/**
 * The pill's resize corner: drag away from the dock to grow, toward it to
 * shrink, double-click to go back to the designed size.
 *
 * Scale comes from the pointer's distance to whichever pill corner is pinned by
 * the dock, so the pill tracks the pointer exactly however it is docked — the
 * pinned corner is the one the dock insets hold still (bottom-right, bottom-left,
 * or bottom-center).
 *
 * No keyboard affordance on purpose: the pill's window is created
 * `focusable: false` (windowConfig.js), so it never receives key events. The
 * Settings presets are the keyboard path to the same setting.
 */
export function PillResizeGrip({
  scale,
  dock,
  pillRef,
  pillWidth,
  pillHeight,
  visible,
  readout,
  onPreview,
  onCommit,
  label,
}: PillResizeGripProps) {
  // The far corner from the dock: that is the one that actually moves.
  const onRight = dock === "left";
  const inset = rimInset(pillHeight);
  const dragRef = useRef<{
    anchorX: number;
    anchorY: number;
    startRadius: number;
    startScale: number;
    scale: number;
  } | null>(null);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = pillRef.current?.getBoundingClientRect();
    if (!rect) return;
    const anchorX =
      dock === "left" ? rect.left : dock === "right" ? rect.right : rect.left + rect.width / 2;
    const anchorY = rect.bottom;
    const startRadius = Math.hypot(event.clientX - anchorX, event.clientY - anchorY);
    if (startRadius < MIN_START_RADIUS_PX) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { anchorX, anchorY, startRadius, startScale: scale, scale };
    onPreview(scale);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onCommit(drag.scale, { x: event.clientX, y: event.clientY });
  };

  return (
    <div
      className={cn("voice-pill-resize-grip", onRight && "voice-pill-resize-grip-right")}
      style={{
        left: onRight ? pillWidth - inset : inset,
        top: inset,
        cursor: onRight ? "nesw-resize" : "nwse-resize",
      }}
      data-visible={visible || undefined}
      title={label}
      aria-hidden="true"
      onPointerDown={beginDrag}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const radius = Math.hypot(event.clientX - drag.anchorX, event.clientY - drag.anchorY);
        const next = clampVoicePillScale((drag.startScale * radius) / drag.startRadius);
        if (next === drag.scale) return;
        drag.scale = next;
        onPreview(next);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onCommit(VOICE_PILL_SCALE.default, { x: event.clientX, y: event.clientY });
      }}
      // The pill under the grip toggles dictation on click; a resize must never
      // also start a recording.
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      {/* A double-headed arrow along the NW–SE diagonal; the right-corner
          variant mirrors the glyph alone, so the readout stays readable. */}
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2.4 2.4 7.6 7.6M2 5.2V2h3.2M8 4.8V8H4.8" />
      </svg>
      {readout && <span className="voice-pill-resize-readout">{readout}</span>}
    </div>
  );
}
