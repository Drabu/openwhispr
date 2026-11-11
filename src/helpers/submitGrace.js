// Grace period between the transcript landing and the Return that submits it.
// A wrong transcript plus an automatic Return is the one failure here that
// cannot be undone, so the keystroke waits long enough to be read and stopped.
export const PRESS_ENTER_DELAY_CHOICES_MS = [0, 2000, 3000, 5000, 8000];
export const PRESS_ENTER_DELAY_DEFAULT_MS = 3000;

// Snapped to an offered choice rather than clamped to a range: the setting is a
// select, and a stored value from a future build with different choices should
// land on the nearest one this build can actually display.
export function clampPressEnterDelayMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return PRESS_ENTER_DELAY_DEFAULT_MS;
  return PRESS_ENTER_DELAY_CHOICES_MS.reduce((best, choice) =>
    Math.abs(choice - ms) < Math.abs(best - ms) ? choice : best
  );
}

// Scaling to length, because one window cannot fit both "yes" and a paragraph:
// long enough for a paragraph is dead time after a word, and short enough after
// a word submits the paragraph before it has been read.
//
// The floor is reaction time, not reading time — noticing the ring, deciding,
// then reaching Esc or the pill. The per-word rate is for *verification*
// reading, which is faster than comprehension: you already know what you said
// and are only checking it came out right.
const GRACE_REACTION_MS = 1500;
const GRACE_PER_WORD_MS = 170;
export const GRACE_MIN_MS = 2000;
// Past this the window stops being a window. Text long enough to need more than
// twelve seconds of checking is text that should not be submitting itself.
export const GRACE_MAX_MS = 12000;

// Scripts without spaces would otherwise count a whole sentence as one word and
// take the floor. An ideograph carries roughly a syllable, so they scan at about
// two to the word.
const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ가-힯]/g;

// Dropped before anything is counted: CJK punctuation sits outside the
// ideograph ranges, so a comma left in the string survives as a
// whitespace-delimited "word" and pads the estimate on exactly the text it
// least applies to.
const CJK_PUNCTUATION_PATTERN = /[\u3000-\u303f\uff01-\uff65]/g;

export function countReadingWords(text) {
  const source = String(text ?? "").replace(CJK_PUNCTUATION_PATTERN, " ");
  const cjkCount = (source.match(CJK_PATTERN) || []).length;
  const spaced = source.replace(CJK_PATTERN, " ").trim();
  const spacedWords = spaced ? spaced.split(/\s+/).filter(Boolean).length : 0;
  return spacedWords + cjkCount / 2;
}

export function submitGraceForText(text) {
  const ms = GRACE_REACTION_MS + countReadingWords(text) * GRACE_PER_WORD_MS;
  return Math.min(GRACE_MAX_MS, Math.max(GRACE_MIN_MS, Math.round(ms)));
}
