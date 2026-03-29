import { useEffect, useMemo, useRef, useState } from "react";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";

import { getFlowStats } from "../core/get-flow-stats";
import type { FlowLayerOptions, FlowLayerResult } from "../types/flow-types";
import {
  getInterpolatedSeriesValue,
  getMetersPerPixel,
  getSampleAngleAt,
  getSamplePointAt,
} from "../utils/flow-utils";

const DEFAULT_ENTITY_MATERIAL = {
  ambient: 0.38,
  diffuse: 0.56,
  shininess: 18,
  specularColor: [90, 90, 90],
};

const EMPTY_PARTICLE_FRAME = {
  attributes: {
    getFillColor: { size: 4, value: new Uint8Array() },
    getPosition: { size: 2, value: new Float64Array() },
    getRadius: { size: 1, value: new Float32Array() },
  },
  length: 0,
};

export const useFlowLayer = ({
  currentTime = 0,
  entityRenderer = null,
  id = "flow",
  mode = "2d",
  particleMaxPixels = 3.4,
  particleMinPixels = 1.1,
  preparedData,
  renderMode = "auto",
  speedMultiplier = 1,
  viewState = null,
}: FlowLayerOptions): FlowLayerResult => {
  const [animationTime, setAnimationTime] = useState(0);
  const particleBuffersRef = useRef<{
    capacity: number;
    colors: Uint8Array;
    positions: Float64Array;
    radii: Float32Array;
  } | null>(null);

  useEffect(() => {
    let animationFrameId = 0;

    const tick = (timestamp: number) => {
      setAnimationTime(timestamp * 0.001);
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, []);

  const usingEntities = useMemo(() => {
    if (!preparedData || !entityRenderer?.mesh) {
      return false;
    }

    if (renderMode === "particles") {
      return false;
    }

    if (renderMode === "entities") {
      if (mode !== "3d" && !entityRenderer.enabledIn2D) {
        return false;
      }

      return true;
    }

    const allowsEntities = mode === "3d" || entityRenderer.enabledIn2D;
    const zoomThreshold = entityRenderer.zoomThreshold ?? 17.5;
    return allowsEntities && (viewState?.zoom ?? 0) >= zoomThreshold;
  }, [entityRenderer, mode, preparedData, renderMode, viewState?.zoom]);

  const lineLayers = useMemo(
    () =>
      preparedData
        ? preparedData.lineLayers.map(
            (layer) =>
              new PathLayer({
                capRounded: true,
                data: layer.paths,
                getColor: layer.color,
                getPath: (item) => item.path,
                getWidth: layer.width,
                id: `${id}-line-${layer.key}`,
                jointRounded: true,
                pickable: false,
                widthMinPixels: layer.width,
                widthUnits: "pixels",
              }),
          )
        : [],
    [id, preparedData],
  );

  const particleFrame = useMemo(() => {
    if (!preparedData) {
      return EMPTY_PARTICLE_FRAME;
    }

    const totalParticleSlots = preparedData.features.reduce(
      (slotCount, feature) => slotCount + feature.maxParticles,
      0,
    );
    const currentCapacity = particleBuffersRef.current?.capacity ?? 0;

    if (currentCapacity < totalParticleSlots) {
      particleBuffersRef.current = {
        capacity: totalParticleSlots,
        colors: new Uint8Array(totalParticleSlots * 4),
        positions: new Float64Array(totalParticleSlots * 2),
        radii: new Float32Array(totalParticleSlots),
      };
    }

    const { colors, positions, radii } = particleBuffersRef.current!;
    let visibleParticleCount = 0;

    for (const feature of preparedData.features) {
      const activeParticles = Math.min(
        feature.maxParticles,
        Math.round(getInterpolatedSeriesValue(feature.values, currentTime) / preparedData.particleDivisor),
      );

      if (activeParticles === 0 || feature.sampleCount < 2) {
        continue;
      }

      for (let visibleIndex = 0; visibleIndex < activeParticles; visibleIndex += 1) {
        const slot = Math.floor((visibleIndex * feature.maxParticles) / activeParticles);
        const progress =
          ((animationTime * speedMultiplier) * feature.particleSpeeds[slot] + feature.particlePhases[slot]) % 1;
        const [longitude, latitude] = getSamplePointAt(feature.samples, feature.sampleCount, progress);
        const positionOffset = visibleParticleCount * 2;
        const colorOffset = visibleParticleCount * 4;

        positions[positionOffset] = longitude + feature.particleJitterLongitude[slot];
        positions[positionOffset + 1] = latitude + feature.particleJitterLatitude[slot];
        colors[colorOffset] = feature.particleColor[0];
        colors[colorOffset + 1] = feature.particleColor[1];
        colors[colorOffset + 2] = feature.particleColor[2];
        colors[colorOffset + 3] = feature.particleColor[3];
        radii[visibleParticleCount] = feature.particleRadius;
        visibleParticleCount += 1;
      }
    }

    return {
      attributes: {
        getFillColor: { size: 4, value: colors.subarray(0, visibleParticleCount * 4) },
        getPosition: { size: 2, value: positions.subarray(0, visibleParticleCount * 2) },
        getRadius: { size: 1, value: radii.subarray(0, visibleParticleCount) },
      },
      length: visibleParticleCount,
    };
  }, [animationTime, currentTime, preparedData, speedMultiplier]);

  const entityFrame = useMemo(() => {
    if (!preparedData || !usingEntities || !viewState || !entityRenderer) {
      return [];
    }

    const metersPerPixel = getMetersPerPixel(
      viewState.latitude ?? preparedData.bounds.centerY,
      viewState.zoom ?? 0,
    );
    const maxEntityLengthMeters = metersPerPixel * (entityRenderer.maxPixelSize ?? 8.5);
    const entityScaleFactor = Math.min(1, maxEntityLengthMeters / 4.1);

    if (entityScaleFactor <= 0) {
      return [];
    }

    const entities: Array<{
      color: [number, number, number, number];
      orientation: [number, number, number];
      position: [number, number, number];
      scale: [number, number, number];
    }> = [];

    for (const feature of preparedData.features) {
      const activeEntities = Math.min(
        feature.maxEntities,
        Math.round(getInterpolatedSeriesValue(feature.values, currentTime) / preparedData.entityDivisor),
      );

      if (activeEntities === 0 || feature.sampleCount < 2) {
        continue;
      }

      for (let visibleIndex = 0; visibleIndex < activeEntities; visibleIndex += 1) {
        const slot = Math.floor((visibleIndex * feature.maxEntities) / activeEntities);
        const progress =
          ((animationTime * speedMultiplier) * feature.entitySpeeds[slot] + feature.entityPhases[slot]) % 1;
        const [longitude, latitude] = getSamplePointAt(feature.samples, feature.sampleCount, progress);
        const heading = getSampleAngleAt(feature.samples, feature.sampleCount, progress);

        entities.push({
          color: feature.entityColor,
          orientation: [0, (heading * 180) / Math.PI - 90, 0],
          position: [
            longitude + feature.entityJitterLongitude[slot],
            latitude + feature.entityJitterLatitude[slot],
            0,
          ],
          scale: [entityScaleFactor, entityScaleFactor, entityScaleFactor],
        });
      }
    }

    return entities;
  }, [animationTime, currentTime, entityRenderer, preparedData, speedMultiplier, usingEntities, viewState]);

  const layers = useMemo(() => {
    if (usingEntities && entityRenderer?.mesh) {
      return [
        ...lineLayers,
        new SimpleMeshLayer({
          _instanced: true,
          data: entityFrame,
          getColor: (item) => item.color,
          getOrientation: (item) => item.orientation,
          getPosition: (item) => item.position,
          getScale: (item) => item.scale,
          id: `${id}-entities`,
          material: entityRenderer.material ?? DEFAULT_ENTITY_MATERIAL,
          mesh: entityRenderer.mesh,
          pickable: false,
          sizeScale: 1,
        }),
      ];
    }

    return [
      ...lineLayers,
      new ScatterplotLayer({
        data: particleFrame,
        filled: true,
        id: `${id}-particles`,
        pickable: false,
        radiusMaxPixels: particleMaxPixels,
        radiusMinPixels: particleMinPixels,
        radiusUnits: "pixels",
        stroked: false,
      }),
    ];
  }, [entityFrame, entityRenderer, id, lineLayers, particleFrame, particleMaxPixels, particleMinPixels, usingEntities]);

  const stats = useMemo(
    () =>
      getFlowStats(preparedData, {
        countMode: usingEntities ? "entities" : "particles",
        currentTime,
      }),
    [currentTime, preparedData, usingEntities],
  );

  return {
    hasTimeSeries: preparedData?.hasTimeSeries ?? false,
    layers,
    stats,
    usingEntities,
  };
};
