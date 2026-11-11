// Browser-only Canny edge extraction. No AI or ControlNet model is run here.
// These are this tool's input limits, not a claim that Sobel gradients end at 255.
export const EDGE_LIMITS = Object.freeze({
  low: Object.freeze([0, 255]), high: Object.freeze([0, 255]), smooth: Object.freeze([0, 3]),
});
export const EDGE_DEFAULTS = Object.freeze({ low: 39, high: 92, smooth: 1 });

function boundedNumber(value, fallback, min, max) {
  const number = value == null ? fallback : Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

/**
 * Extract black edges on an opaque white RGBA background.
 *
 * low/high independently specify Sobel-L2 gradient thresholds in the tool's
 * 0..255 range. They are not brightness cutoffs or semantic importance scores.
 * Reversed thresholds are swapped. A zero threshold still excludes zero-gradient
 * pixels. smooth is 0..3 repetitions of a separable [1, 2, 1]/4 blur, default 1.
 * The input is not resized or mutated; the caller controls processing resolution.
 */
export function canny(rgba, width, height, options = {}) {
  const w = width, h = height, n = w * h;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 3 || h < 3 ||
      !Number.isSafeInteger(n * 4) || rgba == null || rgba.length !== n * 4) {
    throw new Error('图片尺寸不正确：需要至少 3 × 3 像素及完整的 RGBA 数据。');
  }
  options = options || {};
  let low = boundedNumber(options.low, EDGE_DEFAULTS.low, ...EDGE_LIMITS.low);
  let high = boundedNumber(options.high, EDGE_DEFAULTS.high, ...EDGE_LIMITS.high);
  if (low > high) [low, high] = [high, low];
  const smooth = Math.round(boundedNumber(options.smooth, EDGE_DEFAULTS.smooth, ...EDGE_LIMITS.smooth));

  let gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4, alpha = rgba[j + 3] / 255;
    gray[i] = (.299 * rgba[j] + .587 * rgba[j + 1] + .114 * rgba[j + 2]) * alpha + 255 * (1 - alpha);
  }
  // Replicate the image border during blur instead of adding a dark outer frame.
  for (let pass = 0; pass < smooth; pass++) {
    const horizontal = new Float32Array(n), blurred = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      horizontal[i] = (gray[y * w + Math.max(0, x - 1)] + 2 * gray[i] + gray[y * w + Math.min(w - 1, x + 1)]) / 4;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      blurred[i] = (horizontal[Math.max(0, y - 1) * w + x] + 2 * horizontal[i] + horizontal[Math.min(h - 1, y + 1) * w + x]) / 4;
    }
    gray = blurred;
  }

  const gx = new Float32Array(n), gy = new Float32Array(n), magnitude = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const a = gray[i - w - 1], b = gray[i - w], c = gray[i - w + 1];
    const d = gray[i - 1], e = gray[i + 1];
    const f = gray[i + w - 1], g = gray[i + w], j = gray[i + w + 1];
    gx[i] = -a + c - 2 * d + 2 * e - f + j;
    gy[i] = -a - 2 * b - c + f + 2 * g + j;
    magnitude[i] = Math.hypot(gx[i], gy[i]);
  }

  // State: 0 = rejected, 1 = weak candidate, 2 = connected/strong edge.
  const state = new Uint8Array(n), stack = new Int32Array(n);
  let top = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, m = magnitude[i];
    // Essential when low == high == 0: a flat image must remain empty.
    if (m === 0) continue;
    let angle = Math.atan2(gy[i], gx[i]) * 180 / Math.PI;
    if (angle < 0) angle += 180;
    let before, after;
    if (angle < 22.5 || angle >= 157.5) {
      before = magnitude[i - 1]; after = magnitude[i + 1];
    } else if (angle < 67.5) {
      before = magnitude[i - w - 1]; after = magnitude[i + w + 1];
    } else if (angle < 112.5) {
      before = magnitude[i - w]; after = magnitude[i + w];
    } else {
      before = magnitude[i - w + 1]; after = magnitude[i + w - 1];
    }
    // A strict comparison on one side picks one pixel from an equal plateau.
    if (!(m > before && m >= after)) continue;
    if (m >= high) { state[i] = 2; stack[top++] = i; }
    else if (m >= low) state[i] = 1;
  }

  // Hysteresis: retain a weak candidate only if an 8-connected path reaches a
  // strong edge. A pixel is pushed once, so stack capacity never exceeds n.
  while (top) {
    const i = stack[--top], x = i % w, y = Math.floor(i / w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) continue;
      const j = ny * w + nx;
      if (state[j] === 1) { state[j] = 2; stack[top++] = j; }
    }
  }

  const pixels = new Uint8ClampedArray(n * 4);
  let edgePixels = 0;
  for (let i = 0; i < n; i++) {
    const edge = state[i] === 2, j = i * 4, value = edge ? 0 : 255;
    pixels[j] = pixels[j + 1] = pixels[j + 2] = value;
    pixels[j + 3] = 255;
    if (edge) edgePixels++;
  }
  return { pixels, edgePixels, width: w, height: h };
}
