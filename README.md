# pathflow

`pathflow` animates particles or small mesh entities along GeoJSON line data in Deck.gl and standalone maps.

The package is organized around two primary entry points:

1. `usePathflow(...)`
   Use this when you already have your own `DeckGL` map.
2. `StandalonePathflowMap`
   Use this when you want a ready-made map component.

Advanced helpers are still available from `pathflow/advanced`, but most users should start with the two APIs above.

## Install

```bash
npm install pathflow
```

## Data Requirements

Your data must be line-based:

- a GeoJSON `FeatureCollection`, or
- an array of GeoJSON features

Supported geometry types:

- `LineString`
- `MultiLineString`

Each feature must provide either:

- a single numeric value, or
- a time series of numeric values

By default, if you do not provide custom accessors:

- category comes from `properties.link_type`, then `properties.category`
- direction comes from `properties.direction`
- a static value comes from `value`, `volume`, `count`, or `total`
- a time series comes from keys like `hour_0`, `hour_1`, `hour_2`, and so on

The package does not ship opinionated category presets for your data.
If you want per-category colors, widths, radii, or speeds, pass them through `prepareOptions.styleMap`.

## Primary API

### `usePathflow(options)`

This is the main facade hook for existing Deck.gl apps.

`useDeckglPathflow(...)` is also exported if you want the Deck.gl-specific name, but `usePathflow(...)` is the primary API.

It handles:

- preprocessing
- optional timeline state
- layer creation
- summary stats

#### Required input

- one of:
  - `data`
  - `preparedData`

#### Optional input

- `prepareOptions`
  Passed to preprocessing when you provide raw `data`.
- `currentTime`
  Controlled timeline position. If omitted, the hook uses its internal timeline state.
- `autoPlay`
  Defaults to `true`.
- `initialTime`
  Defaults to `0`.
- `loop`
  Defaults to `true`.
- `stepsPerSecond`
  Defaults to `0.35`.
- `renderMode`
  `"auto"`, `"particles"`, or `"entities"`. Defaults to `"auto"`.
- `viewState`
  Used for zoom-aware entity switching and sizing. `usePathflow(...)` also infers 2D vs 3D from `viewState.pitch`, because the user owns the map.
- `speedMultiplier`
  Multiplies movement speed. Defaults to `1`.
- `particleMinPixels`
  Minimum visible particle size.
- `particleMaxPixels`
  Maximum visible particle size.
- `entityRenderer`
  Optional mesh rendering config:

```ts
{
  mesh: any;
  zoomThreshold?: number;
  maxPixelSize?: number;
  enabledIn2D?: boolean;
  material?: Record<string, unknown>;
}
```

#### Returns

```ts
{
  currentTime: number;
  hasTimeSeries: boolean;
  layers: any[];
  preparedData: PreparedFlowData | null;
  stats: {
    activeCount: number;
    activeLinks: number;
    clockLabel: string | null;
    currentStepIndex: number;
    hasTimeSeries: boolean;
    totalValue: number;
  };
  timeline: {
    currentTime: number;
    hasTimeSeries: boolean;
    isPlaying: boolean;
    pause: () => void;
    play: () => void;
    setTime: (time: number) => void;
    stepCount: number;
    toggle: () => void;
  };
  usingEntities: boolean;
  validation: FlowValidationResult | null;
}
```

#### Example

```jsx
import DeckGL from "@deck.gl/react";
import { StaticMap } from "react-map-gl";
import { usePathflow } from "pathflow";

export function TrafficMap({ data, viewState }) {
  const flow = usePathflow({
    data,
    viewState,
    prepareOptions: {
      particleDivisor: 1000,
      entityDivisor: 1000,
      styleMap: {
        motorway: {
          lineColor: "#ffe394",
          particleColor: "#ff6d43",
          speed: 0.26,
        },
      },
    },
  });

  return (
    <>
      <DeckGL controller layers={flow.layers} viewState={viewState}>
        <StaticMap mapboxApiAccessToken={MAPBOX_TOKEN} />
      </DeckGL>

      <div>{flow.stats.clockLabel}</div>
      <div>{flow.stats.activeLinks}</div>
      <div>{flow.stats.activeCount}</div>
    </>
  );
}
```

### `StandalonePathflowMap`

This is the ready-made component for users who do not want to build their own `DeckGL` wrapper.

#### Required input

- `mapboxAccessToken`
- one of:
  - `data`
  - `preparedData`

#### Optional input

- `prepareOptions`
  Passed to preprocessing when raw `data` is used.
- `currentTime`
  Controlled timeline position.
- `mapMode`
  `"2d"` or `"3d"`. Defaults to `"2d"`.
- `renderMode`
  `"auto"`, `"particles"`, or `"entities"`. Defaults to `"auto"`.
- `entityRenderer`
  Same shape as `usePathflow(...)`.
- `speedMultiplier`
  Defaults to `1`.
- `mapStyle`
  Mapbox style URL.
- `viewState`
  Controlled view state.
- `initialViewState`
  Uncontrolled initial view state.
- `fitOnDataChange`
  Defaults to `true`.
- `onViewStateChange(viewState)`
- `onStatsChange(stats)`
- `controller`
  Custom Deck.gl controller options.
- `id`
- `className`
- `style`

#### Returns

- a React component
- stats are reported through `onStatsChange(...)`
- view state changes are reported through `onViewStateChange(...)`

#### Example

```jsx
import { StandalonePathflowMap } from "pathflow";

export function FlowMap({ data, currentTime }) {
  return (
    <StandalonePathflowMap
      currentTime={currentTime}
      data={data}
      mapMode="3d"
      mapboxAccessToken={MAPBOX_TOKEN}
      prepareOptions={{
        particleDivisor: 1000,
        entityDivisor: 1000,
      }}
      style={{ height: 640 }}
    />
  );
}
```

## Main Input Customization

### `prepareOptions`

This is the main place where you customize how raw GeoJSON is interpreted.

Most useful options:

- `getValue(feature, featureIndex)`
- `getTimeSeries(feature, featureIndex)`
- `getCategory(feature, featureIndex)`
- `getDirection(feature, featureIndex)`
- `getFeatureId(feature, featureIndex)`
- `styleMap`
- `defaultStyle`
- `getStyle(feature, context)`
- `particleDivisor`
- `entityDivisor`
- `maxParticlesPerFeature`
- `maxEntitiesPerFeature`
- `sampleStepFactor`
- `minSampleStep`
- `timeSteps`
- `validationMode`
- `onWarning(warning)`

### `styleMap`

Use `styleMap` to customize line and particle styling by category.

The keys in `styleMap` must match whatever your `getCategory(...)` function returns.
They are not GeoJSON-standard values.

Supported style fields:

- `key`
- `lineColor`
- `lineOpacity`
- `lineWidth`
- `particleColor`
- `particleRadius`
- `entityColor`
- `speed`

Example:

```jsx
const flow = usePathflow({
  data,
  viewState,
  prepareOptions: {
    getCategory: (feature) => String(feature.properties?.road_class ?? "default"),
    getValue: (feature) => Number(feature.properties?.volume ?? 0),
    styleMap: {
      local_road: {
        key: "local",
        lineColor: "#1c3752",
        lineOpacity: 96,
        lineWidth: 1.2,
        particleColor: "#8ef0ff",
        particleRadius: 1.6,
        speed: 0.12,
      },
      highway_major: {
        key: "highway",
        lineColor: "#ffcf70",
        lineOpacity: 140,
        lineWidth: 2.4,
        particleColor: "#ff8c5a",
        particleRadius: 2.4,
        speed: 0.28,
      },
    },
  },
});
```

## Advanced API

If you want lower-level control, import from:

```ts
import { prepareFlowData, useFlowLayer, useFlowTimeline } from "pathflow/advanced";
```

Available advanced exports include:

- `prepareFlowData(...)`
- `validateFlowData(...)`
- `useFlowLayer(...)`
- `useFlowTimeline(...)`
- `getFlowStats(...)`
- `createFlowViewState(...)`
- `createLowPolyVehicleMesh()`

The road-traffic preset styles used by this repo’s demo are exported from `pathflow/demo`, not from the core library API.

## Recommended Starting Point

If you already have a map:

- start with `usePathflow(...)`

If you need a ready-to-use map component:

- start with `StandalonePathflowMap`

Only drop down to `pathflow/advanced` if you need deeper control over preprocessing, timeline state, or rendering internals.
