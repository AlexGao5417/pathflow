import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";

import type { GeoSceneBounds } from "../utils/geojson-utils";

export type FlowInputFeature = Feature<LineString | MultiLineString, Record<string, any>>;

export type FlowInputData =
  | FeatureCollection<LineString | MultiLineString, Record<string, any>>
  | FlowInputFeature[];

export type FlowTimeStep = number | string;

export type FlowValidationMode = "silent" | "strict" | "warn";

export type FlowValidationWarning = {
  code:
    | "invalid_input"
    | "invalid_time_series"
    | "missing_value"
    | "missing_geometry"
    | "unsupported_geometry"
    | "invalid_coordinates";
  featureId?: number | string;
  featureIndex?: number;
  message: string;
};

export type FlowValidationResult = {
  acceptedFeatures: number;
  skippedFeatures: number;
  totalFeatures: number;
  warnings: FlowValidationWarning[];
};

export type FlowStyle = {
  entityColor?: string;
  key: string;
  lineColor: string;
  lineOpacity: number;
  lineWidth: number;
  particleColor: string;
  particleRadius: number;
  speed: number;
};

export type FlowStyleMap = Record<string, Partial<FlowStyle>>;

export type FlowMapMode = "2d" | "3d";

export type FlowRenderMode = "auto" | "entities" | "particles";

export type FlowViewState = {
  pitch?: number;
  latitude?: number;
  zoom?: number;
} | null;

export type FlowEntityRenderer = {
  enabledIn2D?: boolean;
  material?: Record<string, unknown>;
  maxPixelSize?: number;
  mesh: any;
  zoomThreshold?: number;
};

export type FlowPrepareOptions = {
  defaultStyle?: Partial<FlowStyle>;
  entityDivisor?: number;
  getCategory?: (feature: FlowInputFeature, featureIndex: number) => string | null | undefined;
  getDirection?: (feature: FlowInputFeature, featureIndex: number) => unknown;
  getFeatureId?: (feature: FlowInputFeature, featureIndex: number) => number | string | null | undefined;
  getStyle?: (
    feature: FlowInputFeature,
    context: { category: string; featureIndex: number; featureId: number | string },
  ) => Partial<FlowStyle> | null | undefined;
  getTimeSeries?: (
    feature: FlowInputFeature,
    featureIndex: number,
  ) => ArrayLike<number> | null | undefined;
  getValue?: (feature: FlowInputFeature, featureIndex: number) => number | null | undefined;
  maxEntitiesPerFeature?: number;
  maxParticlesPerFeature?: number;
  minSampleStep?: number;
  onWarning?: (warning: FlowValidationWarning) => void;
  particleDivisor?: number;
  sampleStepFactor?: number;
  styleMap?: FlowStyleMap;
  stylesByCategory?: FlowStyleMap;
  timeSteps?: FlowTimeStep[];
  validationMode?: FlowValidationMode;
};

export type PreparedFlowFeature = {
  entityColor: [number, number, number, number];
  entityJitterLatitude: Float32Array;
  entityJitterLongitude: Float32Array;
  entityPhases: Float32Array;
  entitySpeeds: Float32Array;
  id: number | string;
  maxEntities: number;
  maxParticles: number;
  particleColor: [number, number, number, number];
  particleJitterLatitude: Float32Array;
  particleJitterLongitude: Float32Array;
  particlePhases: Float32Array;
  particleRadius: number;
  particleSpeeds: Float32Array;
  sampleCount: number;
  samples: Float64Array;
  style: FlowStyle;
  values: Float32Array;
};

export type PreparedFlowLineLayer = {
  color: [number, number, number, number];
  key: string;
  paths: Array<{ path: [number, number][] }>;
  width: number;
};

export type PreparedFlowData = {
  activeLinksByStep: Uint32Array;
  bounds: GeoSceneBounds;
  entityDivisor: number;
  features: PreparedFlowFeature[];
  hasTimeSeries: boolean;
  lineLayers: PreparedFlowLineLayer[];
  particleDivisor: number;
  scaledEntityTotalsByStep: Uint32Array;
  scaledParticleTotalsByStep: Uint32Array;
  stepCount: number;
  timeSteps: FlowTimeStep[];
  totalsByStep: Float32Array;
  validation: FlowValidationResult;
};

export type FlowStats = {
  activeCount: number;
  activeLinks: number;
  clockLabel: string | null;
  currentStepIndex: number;
  hasTimeSeries: boolean;
  totalValue: number;
};

export type FlowStatsOptions = {
  countMode?: "entities" | "particles";
  currentTime?: number;
};

export type FlowTimelineOptions = {
  autoPlay?: boolean;
  initialTime?: number;
  loop?: boolean;
  stepCount: number;
  stepsPerSecond?: number;
};

export type FlowTimelineController = {
  currentTime: number;
  hasTimeSeries: boolean;
  isPlaying: boolean;
  pause: () => void;
  play: () => void;
  setTime: (time: number) => void;
  stepCount: number;
  toggle: () => void;
};

export type FlowLayerOptions = {
  currentTime?: number;
  entityRenderer?: FlowEntityRenderer | null;
  id?: string;
  mode?: FlowMapMode;
  particleMaxPixels?: number;
  particleMinPixels?: number;
  preparedData: PreparedFlowData | null | undefined;
  renderMode?: FlowRenderMode;
  speedMultiplier?: number;
  viewState?: FlowViewState;
};

export type FlowLayerResult = {
  hasTimeSeries: boolean;
  layers: any[];
  stats: FlowStats;
  usingEntities: boolean;
};

export type UseTimeflowOptions = {
  autoPlay?: boolean;
  currentTime?: number;
  data?: FlowInputData | null;
  entityRenderer?: FlowEntityRenderer | null;
  id?: string;
  initialTime?: number;
  loop?: boolean;
  particleMaxPixels?: number;
  particleMinPixels?: number;
  prepareOptions?: FlowPrepareOptions;
  preparedData?: PreparedFlowData | null;
  renderMode?: FlowRenderMode;
  speedMultiplier?: number;
  stepsPerSecond?: number;
  viewState?: FlowViewState;
};

export type UseTimeflowResult = FlowLayerResult & {
  currentTime: number;
  preparedData: PreparedFlowData | null;
  timeline: FlowTimelineController;
  validation: FlowValidationResult | null;
};

export type UsePathflowOptions = UseTimeflowOptions;
export type UsePathflowResult = UseTimeflowResult;
