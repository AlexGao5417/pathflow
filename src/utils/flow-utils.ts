import type { FlowTimeStep } from "../types/flow-types";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const lerp = (start: number, end: number, mix: number) => start + (end - start) * mix;

export const roundToFourDecimals = (value: number) => Math.round(value * 10_000) / 10_000;

export const hexToRgba = (hex: string, alpha = 255): [number, number, number, number] => {
  const safeHex = hex.replace("#", "");
  const expandedHex =
    safeHex.length === 3
      ? safeHex
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : safeHex;

  const resolvedAlpha = alpha <= 1 ? Math.round(alpha * 255) : Math.round(alpha);

  return [
    Number.parseInt(expandedHex.slice(0, 2), 16),
    Number.parseInt(expandedHex.slice(2, 4), 16),
    Number.parseInt(expandedHex.slice(4, 6), 16),
    clamp(resolvedAlpha, 0, 255),
  ];
};

export const createSeededRandom = (seed: number) => {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), value | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const coerceNumericValue = (value: unknown) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const getWrappedStepTime = (stepCount: number, currentTime = 0) => {
  if (stepCount <= 1) {
    return 0;
  }

  return ((currentTime % stepCount) + stepCount) % stepCount;
};

export const getInterpolatedSeriesValue = (values: ArrayLike<number>, currentTime = 0) => {
  if (values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return values[0] ?? 0;
  }

  const wrappedStep = getWrappedStepTime(values.length, currentTime);
  const currentStepIndex = Math.floor(wrappedStep);
  const nextStepIndex = (currentStepIndex + 1) % values.length;
  const mix = wrappedStep - currentStepIndex;

  return lerp(values[currentStepIndex] ?? 0, values[nextStepIndex] ?? 0, mix);
};

export const getCurrentStepIndex = (stepCount: number, currentTime = 0) =>
  Math.floor(getWrappedStepTime(stepCount, currentTime));

export const formatTimeStepLabel = (timeSteps: FlowTimeStep[], stepIndex: number) =>
  timeSteps[stepIndex] == null ? String(stepIndex) : String(timeSteps[stepIndex]);

export const shouldReverseDirection = (direction: unknown) => {
  if (typeof direction === "string") {
    const normalizedDirection = direction.trim().toLowerCase();
    return normalizedDirection === "ba" || normalizedDirection === "reverse" || normalizedDirection === "backward";
  }

  return direction === -1;
};

export const getSamplePointAt = (samples: ArrayLike<number>, sampleCount: number, progress: number) => {
  const lastSampleIndex = Math.max(sampleCount - 1, 0);
  const samplePosition = progress * lastSampleIndex;
  const lowerSampleIndex = Math.floor(samplePosition);
  const upperSampleIndex = Math.min(lastSampleIndex, lowerSampleIndex + 1);
  const mix = samplePosition - lowerSampleIndex;
  const lowerOffset = lowerSampleIndex * 2;
  const upperOffset = upperSampleIndex * 2;

  return [
    lerp(samples[lowerOffset] ?? 0, samples[upperOffset] ?? 0, mix),
    lerp(samples[lowerOffset + 1] ?? 0, samples[upperOffset + 1] ?? 0, mix),
  ] as const;
};

export const getSampleAngleAt = (samples: ArrayLike<number>, sampleCount: number, progress: number) => {
  const sampleDelta = 1 / Math.max(sampleCount - 1, 1);
  const startProgress = Math.max(0, progress - sampleDelta);
  const endProgress = Math.min(1, progress + sampleDelta);
  const [startX, startY] = getSamplePointAt(samples, sampleCount, startProgress);
  const [endX, endY] = getSamplePointAt(samples, sampleCount, endProgress);

  return Math.atan2(endY - startY, endX - startX);
};

export const getMetersPerPixel = (latitude: number, zoom: number) =>
  (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
