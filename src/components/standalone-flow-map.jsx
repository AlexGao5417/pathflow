import React, { useEffect, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { MapContext, StaticMap } from "react-map-gl";

import { createFlowViewState } from "../core/create-flow-view-state";
import { useTimeflow } from "../hooks/use-timeflow";

const BUILDING_LAYER_ID = "pathflow-3d-buildings";
const DEFAULT_MAP_STYLE = "mapbox://styles/mapbox/streets-v11?optimize=true";

const isIgnorableMapLifecycleError = (error) => {
  const message = String(error?.message ?? error ?? "");

  return (
    message.includes("removed") ||
    message.includes("cannot be removed") ||
    message.includes("style is not done loading")
  );
};

const safelyUseMap = (map, callback) => {
  if (!map || map._removed) {
    return;
  }

  try {
    callback(map);
  } catch (error) {
    if (!isIgnorableMapLifecycleError(error)) {
      throw error;
    }
  }
};

const ensure3DBuildings = (map) => {
  safelyUseMap(map, (activeMap) => {
    if (!activeMap.isStyleLoaded?.() || !activeMap.getSource("composite")) {
      return;
    }

    if (activeMap.getLayer(BUILDING_LAYER_ID)) {
      return;
    }

    const labelLayerId = activeMap
      .getStyle()
      ?.layers?.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"])?.id;

    activeMap.addLayer(
      {
        id: BUILDING_LAYER_ID,
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-base": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            0,
            15,
            ["coalesce", ["get", "min_height"], 0],
          ],
          "fill-extrusion-color": "#d9e6ec",
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            0,
            15,
            ["coalesce", ["get", "height"], 0],
          ],
          "fill-extrusion-opacity": 0.34,
        },
      },
      labelLayerId,
    );
  });
};

const remove3DBuildings = (map) => {
  safelyUseMap(map, (activeMap) => {
    if (activeMap.getLayer(BUILDING_LAYER_ID)) {
      activeMap.removeLayer(BUILDING_LAYER_ID);
    }
  });
};

export const StandaloneFlowMap = ({
  className = "traffic-scene",
  controller,
  currentTime = 0,
  data = null,
  entityRenderer = null,
  fitOnDataChange = true,
  id = "flow-map",
  initialViewState = null,
  mapMode = "2d",
  mapStyle = DEFAULT_MAP_STYLE,
  mapboxAccessToken,
  onStatsChange,
  onViewStateChange,
  prepareOptions,
  preparedData: explicitPreparedData = null,
  renderMode = "auto",
  showBaseMap = true,
  speedMultiplier = 1,
  style,
  viewState: controlledViewState = null,
}) => {
  const containerRef = useRef(null);
  const initializedViewRef = useRef(false);
  const mapRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ height: 0, width: 0 });
  const [mapReady, setMapReady] = useState(false);
  const [localViewState, setLocalViewState] = useState(initialViewState);
  const activeViewState = controlledViewState ?? localViewState;
  const {
    layers,
    preparedData,
    stats,
  } = useTimeflow({
    currentTime,
    data,
    entityRenderer,
    id,
    prepareOptions,
    preparedData: explicitPreparedData,
    renderMode,
    speedMultiplier,
    viewState: activeViewState,
  });

  useEffect(() => {
    if (!fitOnDataChange) {
      return;
    }

    initializedViewRef.current = false;
  }, [fitOnDataChange, preparedData]);

  useEffect(() => {
    if (controlledViewState || initialViewState || !preparedData || containerSize.width === 0 || containerSize.height === 0 || initializedViewRef.current) {
      return;
    }

    initializedViewRef.current = true;
    setLocalViewState(
      createFlowViewState(preparedData.bounds, containerSize.width, containerSize.height, {
        is3D: mapMode === "3d",
      }),
    );
  }, [containerSize.height, containerSize.width, controlledViewState, initialViewState, mapMode, preparedData]);

  useEffect(() => {
    if (controlledViewState) {
      return;
    }

    setLocalViewState((previousViewState) =>
      previousViewState
        ? (() => {
            const nextBearing = mapMode === "3d" ? -18 : 0;
            const nextPitch = mapMode === "3d" ? 58 : 0;

            if (previousViewState.bearing === nextBearing && previousViewState.pitch === nextPitch) {
              return previousViewState;
            }

            return {
              ...previousViewState,
              bearing: nextBearing,
              pitch: nextPitch,
            };
          })()
        : previousViewState,
    );
  }, [controlledViewState, mapMode]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const element = containerRef.current;
    const syncSize = () => {
      setContainerSize({
        height: element.clientHeight || 0,
        width: element.clientWidth || 0,
      });
    };

    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(element);
    syncSize();

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!mapReady) {
      return undefined;
    }

    const map = mapRef.current?.getMap?.();
    if (!map) {
      return undefined;
    }

    const syncBuildings = () => {
      if (mapMode === "3d") {
        ensure3DBuildings(map);
        return;
      }

      remove3DBuildings(map);
    };

    syncBuildings();
    safelyUseMap(map, (activeMap) => {
      activeMap.on("styledata", syncBuildings);
    });

    return () => {
      safelyUseMap(map, (activeMap) => {
        activeMap.off("styledata", syncBuildings);
      });
      remove3DBuildings(map);
    };
  }, [mapMode, mapReady]);

  useEffect(() => {
    onStatsChange?.(stats);
  }, [onStatsChange, stats]);

  const resolvedController = controller ?? {
    dragRotate: mapMode === "3d",
    touchRotate: mapMode === "3d",
  };
  const resolvedStyle = showBaseMap ? style : { background: "#071018", ...style };

  return (
    <div ref={containerRef} className={className} style={resolvedStyle}>
      {activeViewState ? (
        <DeckGL
          ContextProvider={MapContext.Provider}
          controller={resolvedController}
          height="100%"
          layers={layers}
          onViewStateChange={(event) => {
            if (!controlledViewState) {
              setLocalViewState(event.viewState);
            }

            onViewStateChange?.(event.viewState);
          }}
          viewState={activeViewState}
          width="100%"
        >
          {showBaseMap ? (
            <StaticMap
              mapStyle={mapStyle}
              mapboxApiAccessToken={mapboxAccessToken}
              onLoad={() => setMapReady(true)}
              ref={mapRef}
            />
          ) : null}
        </DeckGL>
      ) : null}
    </div>
  );
};

export const StandalonePathflowScene = (props) => (
  <StandaloneFlowMap
    {...props}
    showBaseMap={false}
  />
);
