import { useMemo } from "react";

import { prepareFlowData } from "../core/prepare-flow-data";
import type { UseTimeflowOptions, UseTimeflowResult } from "../types/flow-types";
import { useFlowLayer } from "./use-flow-layer";
import { useFlowTimeline } from "./use-flow-timeline";

export const useTimeflow = ({
  autoPlay = true,
  currentTime,
  data = null,
  entityRenderer = null,
  id = "flow",
  initialTime = 0,
  loop = true,
  particleMaxPixels = 3.4,
  particleMinPixels = 1.1,
  prepareOptions,
  preparedData: explicitPreparedData = null,
  renderMode = "auto",
  speedMultiplier = 1,
  stepsPerSecond = 0.35,
  viewState = null,
}: UseTimeflowOptions): UseTimeflowResult => {
  const preparedData = useMemo(
    () => explicitPreparedData ?? (data ? prepareFlowData(data, prepareOptions) : null),
    [data, explicitPreparedData, prepareOptions],
  );
  const resolvedMode = (viewState?.pitch ?? 0) > 0 ? "3d" : "2d";

  const timeline = useFlowTimeline({
    autoPlay,
    initialTime,
    loop,
    stepCount: preparedData?.stepCount ?? 1,
    stepsPerSecond,
  });

  const resolvedCurrentTime = currentTime ?? timeline.currentTime;
  const flowLayer = useFlowLayer({
    currentTime: resolvedCurrentTime,
    entityRenderer,
    id,
    mode: resolvedMode,
    particleMaxPixels,
    particleMinPixels,
    preparedData,
    renderMode,
    speedMultiplier,
    viewState,
  });

  return {
    ...flowLayer,
    currentTime: resolvedCurrentTime,
    preparedData,
    timeline,
    validation: preparedData?.validation ?? null,
  };
};
