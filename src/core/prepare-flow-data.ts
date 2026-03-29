import type { Feature, LineString } from "geojson";

import { getFeatureBounds, sampleLineCoordinates } from "../utils/geojson-utils";
import type {
  FlowInputData,
  FlowInputFeature,
  FlowPrepareOptions,
  FlowStyle,
  FlowValidationResult,
  FlowValidationWarning,
  PreparedFlowData,
  PreparedFlowFeature,
  PreparedFlowLineLayer,
} from "../types/flow-types";
import {
  clamp,
  coerceNumericValue,
  createSeededRandom,
  hexToRgba,
  shouldReverseDirection,
} from "../utils/flow-utils";

const DEFAULT_ENTITY_DIVISOR = 1000;
const DEFAULT_MAX_ENTITIES_PER_FEATURE = 6;
const DEFAULT_MAX_PARTICLES_PER_FEATURE = 18;
const DEFAULT_MIN_SAMPLE_STEP = 0.00008;
const DEFAULT_PARTICLE_DIVISOR = 1000;
const DEFAULT_SAMPLE_STEP_FACTOR = 0.0022;
const DEFAULT_VALUE_KEYS = ["value", "volume", "count", "total"];
const HOUR_KEY_PATTERN = /^hour_(\d+)$/;
const FEATURE_SEED_PRIME = 7919;
const SEGMENT_SEED_PRIME = 104729;
const MIN_SPEED_SCALE = 0.04;
const MAX_SPEED_SCALE = 0.2;
const PARTICLE_PHASE_VARIANCE = 0.06;
const PARTICLE_SPEED_VARIANCE_BASE = 0.82;
const PARTICLE_SPEED_VARIANCE_RANGE = 0.34;
const PARTICLE_JITTER_FACTOR = 0.24;
const ENTITY_PHASE_VARIANCE = 0.08;
const ENTITY_SPEED_VARIANCE_BASE = 0.72;
const ENTITY_SPEED_VARIANCE_RANGE = 0.24;
const ENTITY_JITTER_FACTOR = 0.08;
const DEFAULT_FLOW_STYLE: FlowStyle = {
  entityColor: "#4da6cf",
  key: "default",
  lineColor: "#4da6cf",
  lineOpacity: 96,
  lineWidth: 1.4,
  particleColor: "#4da6cf",
  particleRadius: 1.9,
  speed: 0.18,
};

type CandidateFlowFeature = {
  category: string;
  feature: FlowInputFeature;
  featureId: number | string;
  featureIndex: number;
  segments: [number, number][][];
  style: FlowStyle;
  values: Float32Array;
};

const defaultGetCategory = (feature: FlowInputFeature) =>
  String(feature.properties?.link_type ?? feature.properties?.category ?? "default");

const defaultGetDirection = (feature: FlowInputFeature) => feature.properties?.direction;

const defaultGetFeatureId = (feature: FlowInputFeature, featureIndex: number) =>
  (feature.id as number | string | undefined) ?? feature.properties?.id ?? featureIndex;

const defaultGetValue = (feature: FlowInputFeature) => {
  for (const key of DEFAULT_VALUE_KEYS) {
    const numericValue = coerceNumericValue(feature.properties?.[key]);
    if (numericValue != null) {
      return numericValue;
    }
  }

  return null;
};

const defaultGetTimeSeries = (feature: FlowInputFeature) => {
  const hourEntries = Object.entries(feature.properties ?? {})
    .map(([key, value]) => {
      const match = key.match(HOUR_KEY_PATTERN);
      return match ? [Number(match[1]), coerceNumericValue(value) ?? 0] : null;
    })
    .filter(Boolean) as Array<[number, number]>;

  if (hourEntries.length === 0) {
    return null;
  }

  hourEntries.sort((left, right) => left[0] - right[0]);
  const highestHourIndex = hourEntries.at(-1)?.[0] ?? 0;
  const series = Array.from({ length: highestHourIndex + 1 }, () => 0);

  for (const [hourIndex, value] of hourEntries) {
    series[hourIndex] = value;
  }

  return series;
};

const createValidation = (totalFeatures: number): FlowValidationResult => ({
  acceptedFeatures: 0,
  skippedFeatures: 0,
  totalFeatures,
  warnings: [],
});

const emitWarning = (
  validation: FlowValidationResult,
  options: FlowPrepareOptions,
  warning: FlowValidationWarning,
) => {
  options.onWarning?.(warning);

  if (options.validationMode === "strict") {
    throw new Error(warning.message);
  }

  if (options.validationMode === "warn") {
    validation.warnings.push(warning);
  }
};

const toFeatureArray = (
  data: FlowInputData,
  validation: FlowValidationResult,
  options: FlowPrepareOptions,
) => {
  if (Array.isArray(data)) {
    return data;
  }

  if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
    return data.features as FlowInputFeature[];
  }

  emitWarning(validation, options, {
    code: "invalid_input",
    message: "Flow data must be a GeoJSON FeatureCollection or an array of line features.",
  });

  return [];
};

const normalizeSeriesValues = (
  candidateSeries: ArrayLike<number> | null | undefined,
  targetStepCount: number,
) => {
  if (candidateSeries == null) {
    return null;
  }

  const rawSeries = Array.from(candidateSeries, (value) => coerceNumericValue(value) ?? 0);
  if (rawSeries.length === 0) {
    return null;
  }

  if (targetStepCount === 1) {
    return Float32Array.from([rawSeries[0]]);
  }

  if (rawSeries.length === 1) {
    return Float32Array.from(Array.from({ length: targetStepCount }, () => rawSeries[0]));
  }

  if (rawSeries.length !== targetStepCount) {
    return null;
  }

  return Float32Array.from(rawSeries);
};

const createResolvedStyle = (
  feature: FlowInputFeature,
  featureIndex: number,
  featureId: number | string,
  category: string,
  options: FlowPrepareOptions,
) => {
  const categoryStyle = {
    ...options.stylesByCategory?.[category],
    ...options.styleMap?.[category],
  };
  const customStyle = options.getStyle?.(feature, { category, featureId, featureIndex });
  const resolvedStyle = {
    ...DEFAULT_FLOW_STYLE,
    ...options.defaultStyle,
    ...categoryStyle,
    ...customStyle,
  } satisfies FlowStyle;

  return {
    ...resolvedStyle,
    entityColor: resolvedStyle.entityColor ?? resolvedStyle.particleColor,
    key: resolvedStyle.key ?? category ?? "default",
  } satisfies FlowStyle;
};

const validateLineSegment = (
  coordinates: unknown,
  validation: FlowValidationResult,
  options: FlowPrepareOptions,
  featureId: number | string,
  featureIndex: number,
) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    emitWarning(validation, options, {
      code: "invalid_coordinates",
      featureId,
      featureIndex,
      message: `Feature ${featureId} does not contain at least two valid coordinates.`,
    });
    return null;
  }

  const segment = coordinates
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
      }

      const longitude = coerceNumericValue(coordinate[0]);
      const latitude = coerceNumericValue(coordinate[1]);
      return longitude == null || latitude == null ? null : ([longitude, latitude] as [number, number]);
    })
    .filter(Boolean) as [number, number][];

  if (segment.length < 2) {
    emitWarning(validation, options, {
      code: "invalid_coordinates",
      featureId,
      featureIndex,
      message: `Feature ${featureId} does not contain at least two finite coordinate pairs.`,
    });
    return null;
  }

  return segment;
};

const createCandidateFeatures = (
  sourceFeatures: FlowInputFeature[],
  options: FlowPrepareOptions,
  validation: FlowValidationResult,
) => {
  const getCategory = options.getCategory ?? defaultGetCategory;
  const getDirection = options.getDirection ?? defaultGetDirection;
  const getFeatureId = options.getFeatureId ?? defaultGetFeatureId;
  const getTimeSeries = options.getTimeSeries ?? defaultGetTimeSeries;
  const getValue = options.getValue ?? defaultGetValue;
  const timeSeriesLengths: number[] = [];
  const candidates: Array<{
    category: string;
    feature: FlowInputFeature;
    featureId: number | string;
    featureIndex: number;
    rawSeries: ArrayLike<number> | null;
    segments: [number, number][][];
    staticValue: number | null;
    style: FlowStyle;
  }> = [];
  const boundsFeatures: Feature<LineString>[] = [];

  for (let featureIndex = 0; featureIndex < sourceFeatures.length; featureIndex += 1) {
    const feature = sourceFeatures[featureIndex];
    const featureId = getFeatureId(feature, featureIndex) ?? featureIndex;
    const geometry = feature?.geometry;

    if (!geometry) {
      emitWarning(validation, options, {
        code: "missing_geometry",
        featureId,
        featureIndex,
        message: `Feature ${featureId} does not contain geometry.`,
      });
      continue;
    }

    const category = getCategory(feature, featureIndex) ?? "default";
    const style = createResolvedStyle(feature, featureIndex, featureId, category, options);
    const rawSeries = getTimeSeries(feature, featureIndex);
    const staticValue = rawSeries == null ? coerceNumericValue(getValue(feature, featureIndex)) : null;

    if (rawSeries == null && staticValue == null) {
      emitWarning(validation, options, {
        code: "missing_value",
        featureId,
        featureIndex,
        message: `Feature ${featureId} does not contain a numeric value or time series.`,
      });
      continue;
    }

    if (rawSeries != null && Array.from(rawSeries).length > 0) {
      timeSeriesLengths.push(Array.from(rawSeries).length);
    }

    const rawSegments =
      geometry.type === "LineString"
        ? [geometry.coordinates]
        : geometry.type === "MultiLineString"
          ? geometry.coordinates
          : null;

    if (!rawSegments) {
      emitWarning(validation, options, {
        code: "unsupported_geometry",
        featureId,
        featureIndex,
        message: `Feature ${featureId} must use LineString or MultiLineString geometry.`,
      });
      continue;
    }

    const direction = getDirection(feature, featureIndex);
    const segments = rawSegments
      .map((segment) => validateLineSegment(segment, validation, options, featureId, featureIndex))
      .filter(Boolean)
      .map((segment) => (shouldReverseDirection(direction) ? segment.slice().reverse() : segment)) as [number, number][][];

    if (segments.length === 0) {
      continue;
    }

    for (const segment of segments) {
      boundsFeatures.push({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: segment,
        },
      });
    }

    candidates.push({
      category,
      feature,
      featureId,
      featureIndex,
      rawSeries,
      segments,
      staticValue,
      style,
    });
  }

  return {
    boundsFeatures,
    candidates,
    inferredStepCount: Math.max(...timeSeriesLengths, 1),
  };
};

export const prepareFlowData = (
  data: FlowInputData,
  options: FlowPrepareOptions = {},
): PreparedFlowData => {
  const validation = createValidation(Array.isArray(data) ? data.length : data?.features?.length ?? 0);
  const sourceFeatures = toFeatureArray(data, validation, options);
  const {
    boundsFeatures,
    candidates,
    inferredStepCount,
  } = createCandidateFeatures(sourceFeatures, options, validation);
  const stepCount = Math.max(1, options.timeSteps?.length ?? inferredStepCount);
  const hasTimeSeries = stepCount > 1;
  const timeSteps =
    options.timeSteps?.slice() ?? Array.from({ length: stepCount }, (_, index) => index);
  const bounds = getFeatureBounds(boundsFeatures);
  const sampleStep = Math.max(
    options.minSampleStep ?? DEFAULT_MIN_SAMPLE_STEP,
    Math.max(bounds.width, bounds.height) * (options.sampleStepFactor ?? DEFAULT_SAMPLE_STEP_FACTOR),
  );
  const particleDivisor = options.particleDivisor ?? DEFAULT_PARTICLE_DIVISOR;
  const entityDivisor = options.entityDivisor ?? DEFAULT_ENTITY_DIVISOR;
  const maxParticlesPerFeature = options.maxParticlesPerFeature ?? DEFAULT_MAX_PARTICLES_PER_FEATURE;
  const maxEntitiesPerFeature = options.maxEntitiesPerFeature ?? DEFAULT_MAX_ENTITIES_PER_FEATURE;
  const totalsByStep = Array.from({ length: stepCount }, () => 0);
  const activeLinksByStep = Array.from({ length: stepCount }, () => 0);
  const scaledParticleTotalsByStep = Array.from({ length: stepCount }, () => 0);
  const scaledEntityTotalsByStep = Array.from({ length: stepCount }, () => 0);
  const lineLayers = new Map<string, PreparedFlowLineLayer>();
  const preparedFeatures: PreparedFlowFeature[] = [];
  const acceptedFeatureIndexes = new Set<number>();

  for (const candidate of candidates) {
    const normalizedValues =
      candidate.rawSeries != null
        ? normalizeSeriesValues(candidate.rawSeries, stepCount)
        : Float32Array.from(Array.from({ length: stepCount }, () => candidate.staticValue ?? 0));

    if (!normalizedValues) {
      emitWarning(validation, options, {
        code: "invalid_time_series",
        featureId: candidate.featureId,
        featureIndex: candidate.featureIndex,
        message: `Feature ${candidate.featureId} does not match the configured time-step count of ${stepCount}.`,
      });
      continue;
    }

    acceptedFeatureIndexes.add(candidate.featureIndex);
    const featureMaxValue = Math.max(...normalizedValues);

    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      const value = normalizedValues[stepIndex] ?? 0;
      totalsByStep[stepIndex] += value;
      if (value > 0) {
        activeLinksByStep[stepIndex] += 1;
      }
    }

    const segmentValueScale = 1 / candidate.segments.length;

    for (let segmentIndex = 0; segmentIndex < candidate.segments.length; segmentIndex += 1) {
      const segment = candidate.segments[segmentIndex];
      const layer = lineLayers.get(candidate.style.key) ?? {
        color: hexToRgba(candidate.style.lineColor, candidate.style.lineOpacity),
        key: candidate.style.key,
        paths: [],
        width: candidate.style.lineWidth,
      };

      layer.paths.push({ path: segment });
      lineLayers.set(candidate.style.key, layer);

      if (featureMaxValue <= 0) {
        continue;
      }

      const segmentValues = Float32Array.from(normalizedValues, (value) => value * segmentValueScale);
      const segmentMaxValue = Math.max(...segmentValues);
      const maxParticles = Math.min(maxParticlesPerFeature, Math.round(segmentMaxValue / particleDivisor));
      const maxEntities = Math.min(maxEntitiesPerFeature, Math.round(segmentMaxValue / entityDivisor));

      for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
        scaledParticleTotalsByStep[stepIndex] += Math.min(
          maxParticles,
          Math.round(segmentValues[stepIndex] / particleDivisor),
        );
        scaledEntityTotalsByStep[stepIndex] += Math.min(
          maxEntities,
          Math.round(segmentValues[stepIndex] / entityDivisor),
        );
      }

      if (maxParticles === 0 && maxEntities === 0) {
        continue;
      }

      const sampledCoordinates = sampleLineCoordinates(segment, sampleStep);
      if (sampledCoordinates.length < 2) {
        continue;
      }

      const samples = new Float64Array(sampledCoordinates.length * 2);
      for (let sampleIndex = 0; sampleIndex < sampledCoordinates.length; sampleIndex += 1) {
        const [longitude, latitude] = sampledCoordinates[sampleIndex];
        const offset = sampleIndex * 2;
        samples[offset] = longitude;
        samples[offset + 1] = latitude;
      }

      const random = createSeededRandom(
        candidate.featureIndex * FEATURE_SEED_PRIME + segmentIndex * SEGMENT_SEED_PRIME,
      );
      const particlePhases = new Float32Array(maxParticles);
      const particleSpeeds = new Float32Array(maxParticles);
      const particleJitterLongitude = new Float32Array(maxParticles);
      const particleJitterLatitude = new Float32Array(maxParticles);
      const entityPhases = new Float32Array(maxEntities);
      const entitySpeeds = new Float32Array(maxEntities);
      const entityJitterLongitude = new Float32Array(maxEntities);
      const entityJitterLatitude = new Float32Array(maxEntities);
      // Keep long roads from becoming too slow and short roads from becoming too fast.
      const speedScale = clamp(
        candidate.style.speed / Math.max(1, Math.sqrt(sampledCoordinates.length - 1)),
        MIN_SPEED_SCALE,
        MAX_SPEED_SCALE,
      );

      for (let slot = 0; slot < maxParticles; slot += 1) {
        particlePhases[slot] = slot / maxParticles + random() * PARTICLE_PHASE_VARIANCE;
        particleSpeeds[slot] =
          speedScale * (PARTICLE_SPEED_VARIANCE_BASE + random() * PARTICLE_SPEED_VARIANCE_RANGE);
        particleJitterLongitude[slot] = (random() - 0.5) * sampleStep * PARTICLE_JITTER_FACTOR;
        particleJitterLatitude[slot] = (random() - 0.5) * sampleStep * PARTICLE_JITTER_FACTOR;
      }

      for (let slot = 0; slot < maxEntities; slot += 1) {
        entityPhases[slot] = slot / Math.max(maxEntities, 1) + random() * ENTITY_PHASE_VARIANCE;
        entitySpeeds[slot] =
          speedScale * (ENTITY_SPEED_VARIANCE_BASE + random() * ENTITY_SPEED_VARIANCE_RANGE);
        entityJitterLongitude[slot] = (random() - 0.5) * sampleStep * ENTITY_JITTER_FACTOR;
        entityJitterLatitude[slot] = (random() - 0.5) * sampleStep * ENTITY_JITTER_FACTOR;
      }

      preparedFeatures.push({
        entityColor: hexToRgba(candidate.style.entityColor ?? candidate.style.particleColor, 235),
        entityJitterLatitude,
        entityJitterLongitude,
        entityPhases,
        entitySpeeds,
        id: candidate.segments.length > 1 ? `${candidate.featureId}:${segmentIndex}` : candidate.featureId,
        maxEntities,
        maxParticles,
        particleColor: hexToRgba(candidate.style.particleColor, 232),
        particleJitterLatitude,
        particleJitterLongitude,
        particlePhases,
        particleRadius: candidate.style.particleRadius,
        particleSpeeds,
        sampleCount: sampledCoordinates.length,
        samples,
        style: candidate.style,
        values: segmentValues,
      });
    }
  }

  validation.acceptedFeatures = acceptedFeatureIndexes.size;
  validation.skippedFeatures = validation.totalFeatures - validation.acceptedFeatures;

  return {
    activeLinksByStep: Uint32Array.from(activeLinksByStep),
    bounds,
    entityDivisor,
    features: preparedFeatures,
    hasTimeSeries,
    lineLayers: Array.from(lineLayers.values()),
    particleDivisor,
    scaledEntityTotalsByStep: Uint32Array.from(scaledEntityTotalsByStep),
    scaledParticleTotalsByStep: Uint32Array.from(scaledParticleTotalsByStep),
    stepCount,
    timeSteps,
    totalsByStep: Float32Array.from(totalsByStep),
    validation,
  };
};

export const validateFlowData = (data: FlowInputData, options: FlowPrepareOptions = {}) =>
  prepareFlowData(data, options).validation;
