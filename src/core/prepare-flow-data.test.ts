import { describe, expect, it } from "vitest";

import { getFlowStats } from "./get-flow-stats";
import { prepareFlowData } from "./prepare-flow-data";

describe("prepareFlowData", () => {
  it("prepares static line data and reports validation warnings for unsupported features", () => {
    const prepared = prepareFlowData(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { category: "residential_street", volume: 1000 },
            geometry: {
              type: "LineString",
              coordinates: [
                [144.95, -37.81],
                [144.96, -37.815],
              ],
            },
          },
          {
            type: "Feature",
            properties: { volume: 500 },
            geometry: {
              type: "Point",
              coordinates: [144.97, -37.82],
            },
          },
        ],
      },
      {
        getCategory: (feature) => String(feature.properties?.category ?? "default"),
        getValue: (feature) => Number(feature.properties?.volume ?? 0),
        particleDivisor: 1000,
        validationMode: "warn",
      },
    );

    expect(prepared.hasTimeSeries).toBe(false);
    expect(prepared.features).toHaveLength(1);
    expect(prepared.validation.acceptedFeatures).toBe(1);
    expect(prepared.validation.skippedFeatures).toBe(1);
    expect(prepared.validation.warnings[0]?.code).toBe("unsupported_geometry");

    const stats = getFlowStats(prepared, { currentTime: 0 });
    expect(stats.clockLabel).toBeNull();
    expect(stats.activeLinks).toBe(1);
    expect(stats.activeCount).toBe(1);
    expect(stats.totalValue).toBe(1000);
  });

  it("prepares time-series data with custom accessors and interpolates flow stats", () => {
    const prepared = prepareFlowData(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              direction: "AB",
              series: [100, 200, 300],
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [151.205, -33.87],
                [151.215, -33.865],
              ],
            },
          },
        ],
      },
      {
        getTimeSeries: (feature) => feature.properties?.series,
        particleDivisor: 100,
        timeSteps: ["00:00", "01:00", "02:00"],
      },
    );

    expect(prepared.hasTimeSeries).toBe(true);
    expect(prepared.stepCount).toBe(3);
    expect(prepared.validation.acceptedFeatures).toBe(1);

    const stats = getFlowStats(prepared, { currentTime: 1.5 });
    expect(stats.clockLabel).toBe("01:00");
    expect(stats.activeLinks).toBe(1);
    expect(stats.activeCount).toBe(3);
    expect(stats.totalValue).toBe(250);
  });

  it("accepts a styleMap input for category-level line and particle styling", () => {
    const prepared = prepareFlowData(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { category: "custom_local", volume: 2400 },
            geometry: {
              type: "LineString",
              coordinates: [
                [144.95, -37.81],
                [144.96, -37.815],
              ],
            },
          },
        ],
      },
      {
        getCategory: (feature) => String(feature.properties?.category ?? "default"),
        getValue: (feature) => Number(feature.properties?.volume ?? 0),
        styleMap: {
          custom_local: {
            key: "custom-local",
            lineColor: "#10243a",
            lineOpacity: 140,
            lineWidth: 2.4,
            particleColor: "#ffd166",
            particleRadius: 2.9,
            speed: 0.33,
          },
        },
      },
    );

    expect(prepared.features[0]?.style.key).toBe("custom-local");
    expect(prepared.features[0]?.style.lineColor).toBe("#10243a");
    expect(prepared.features[0]?.style.lineOpacity).toBe(140);
    expect(prepared.features[0]?.style.lineWidth).toBe(2.4);
    expect(prepared.features[0]?.style.particleColor).toBe("#ffd166");
    expect(prepared.features[0]?.style.particleRadius).toBe(2.9);
    expect(prepared.features[0]?.style.speed).toBe(0.33);
  });
});
