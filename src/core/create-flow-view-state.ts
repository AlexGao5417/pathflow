import { WebMercatorViewport } from "@deck.gl/core";

import type { GeoSceneBounds } from "../utils/geojson-utils";

export const createFlowViewState = (
  bounds: GeoSceneBounds,
  width: number,
  height: number,
  options: {
    bearing?: number;
    is3D?: boolean;
    padding?: number;
    pitch?: number;
  } = {},
) => {
  const viewport = new WebMercatorViewport({
    height: Math.max(height, 1),
    latitude: bounds.centerY,
    longitude: bounds.centerX,
    width: Math.max(width, 1),
  });
  const { latitude, longitude, zoom } = viewport.fitBounds(
    [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.maxY],
    ],
    { padding: options.padding ?? 48 },
  );

  return {
    bearing: options.is3D ? (options.bearing ?? -18) : 0,
    latitude,
    longitude,
    pitch: options.is3D ? (options.pitch ?? 58) : 0,
    zoom,
  };
};
