// Mirrors lacksMacReleaseSignal() in hotkeyManager.js — change together.
// Hold-to-X only works on keys macOS reports a release for: the ones the native
// listener watches (Globe/Fn, right-side modifiers, mouse buttons) and modifier
// chords. A lone regular key goes through globalShortcut, which autorepeats and
// never reports release, so a hold would latch on with no way to let go.
const RIGHT_SIDE_MODIFIER_PATTERN =
  /^Right(Control|Ctrl|Alt|Option|Shift|Command|Cmd|Super|Meta|Win)$/i;

export const isGlobeLikeHotkey = (hotkey) => hotkey === "GLOBE" || hotkey === "Fn";
export const isMouseButtonHotkey = (hotkey) => /^MouseButton[45]$/i.test(hotkey || "");
export const isRightSideModifier = (hotkey) => RIGHT_SIDE_MODIFIER_PATTERN.test(hotkey || "");

export function isHoldCapableHotkey(hotkey) {
  if (!hotkey) return false;
  return (
    hotkey.includes("+") ||
    isGlobeLikeHotkey(hotkey) ||
    isMouseButtonHotkey(hotkey) ||
    isRightSideModifier(hotkey)
  );
}
