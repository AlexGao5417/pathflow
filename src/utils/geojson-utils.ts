import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";

export type GeoSceneBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

const roundToFourDecimals = (value: number) => Math.round(value * 10_000) / 10_000;

const collectGeometryCoordinates = (geometry: Geometry | null | undefined, collector: Position[]) => {
  if (!geometry) return;

  switch (geometry.type) {
    case "Point":
      collector.push((geometry as Point).coordinates);
      break;
    case "MultiPoint":
    case "LineString":
      collector.push(...(geometry as Point | MultiPoint | LineString).coordinates);
      break;
    case "MultiLineString":
    case "Polygon":
      for (const line of (geometry as MultiLineString | Polygon).coordinates) {
        collector.push(...line);
      }
      break;
    case "MultiPolygon":
      for (const polygon of (geometry as MultiPolygon).coordinates) {
        for (const ring of polygon) {
          collector.push(...ring);
        }
      }
      break;
    default:
      break;
  }
};

export const groupFeaturesByRegion = (featureCollection: FeatureCollection) =>
  featureCollection.features.reduce<Record<string, Feature[]>>((groups, feature) => {
    const region = String(feature.properties?.region ?? "default");
    groups[region] ??= [];
    groups[region].push(feature);
    return groups;
  }, {});

export const getFeatureBounds = (features: Feature[]): GeoSceneBounds => {
  const coordinates: Position[] = [];

  for (const feature of features) {
    collectGeometryCoordinates(feature.geometry, coordinates);
  }

  if (coordinates.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of coordinates) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const width = roundToFourDecimals(maxX - minX);
  const height = roundToFourDecimals(maxY - minY);

  return {
    minX: roundToFourDecimals(minX),
    maxX: roundToFourDecimals(maxX),
    minY: roundToFourDecimals(minY),
    maxY: roundToFourDecimals(maxY),
    width,
    height,
    centerX: roundToFourDecimals(minX + width / 2),
    centerY: roundToFourDecimals(minY + height / 2),
  };
};

export const normalizeCoordinate = (
  coordinate: Position,
  bounds: GeoSceneBounds,
  padding = 0.1,
) => {
  const longestSide = Math.max(bounds.width, bounds.height) || 1;
  const sceneSpan = 1 - padding * 2;
  const scale = sceneSpan / longestSide;

  return [
    roundToFourDecimals((coordinate[0] - bounds.centerX) * scale),
    roundToFourDecimals((coordinate[1] - bounds.centerY) * scale),
  ] satisfies [number, number];
};

export const sampleLineCoordinates = (coordinates: Position[], stepDistance: number) => {
  if (coordinates.length <= 1 || stepDistance <= 0) {
    return coordinates.map(([x, y]) => [roundToFourDecimals(x), roundToFourDecimals(y)]);
  }

  const samples: [number, number][] = [];
  let remainingStep = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const [startX, startY] = coordinates[index];
    const [endX, endY] = coordinates[index + 1];
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const segmentLength = Math.hypot(segmentX, segmentY);

    if (index === 0) {
      samples.push([roundToFourDecimals(startX), roundToFourDecimals(startY)]);
      remainingStep = stepDistance;
    }

    if (segmentLength === 0) continue;

    while (remainingStep <= segmentLength) {
      const ratio = remainingStep / segmentLength;
      samples.push([
        roundToFourDecimals(startX + segmentX * ratio),
        roundToFourDecimals(startY + segmentY * ratio),
      ]);
      remainingStep += stepDistance;
    }

    remainingStep -= segmentLength;
  }

  const [finalX, finalY] = coordinates.at(-1) as Position;
  const finalSample: [number, number] = [roundToFourDecimals(finalX), roundToFourDecimals(finalY)];
  const lastSample = samples.at(-1);

  if (!lastSample || lastSample[0] !== finalSample[0] || lastSample[1] !== finalSample[1]) {
    samples.push(finalSample);
  }

  return samples;
};
