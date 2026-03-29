import { useCallback, useEffect, useMemo, useState } from "react";

import type { FlowTimelineController, FlowTimelineOptions } from "../types/flow-types";

const clampTimelineTime = (time: number, stepCount: number) => {
  if (stepCount <= 1) {
    return 0;
  }

  return Math.max(0, Math.min(stepCount - 1, time));
};

const advanceTimelineTime = (time: number, stepCount: number, loop: boolean) => {
  if (stepCount <= 1) {
    return 0;
  }

  if (loop) {
    return ((time % stepCount) + stepCount) % stepCount;
  }

  return clampTimelineTime(time, stepCount);
};

export const useFlowTimeline = ({
  autoPlay = true,
  initialTime = 0,
  loop = true,
  stepCount,
  stepsPerSecond = 0.35,
}: FlowTimelineOptions): FlowTimelineController => {
  const [currentTime, setCurrentTime] = useState(() =>
    clampTimelineTime(initialTime, stepCount),
  );
  const [isPlaying, setIsPlaying] = useState(autoPlay && stepCount > 1);

  useEffect(() => {
    setCurrentTime((previousTime) => clampTimelineTime(previousTime, stepCount));
    if (stepCount <= 1) {
      setIsPlaying(false);
    }
  }, [stepCount]);

  useEffect(() => {
    if (!isPlaying || stepCount <= 1 || stepsPerSecond <= 0) {
      return undefined;
    }

    let animationFrameId = 0;
    let previousFrameTime = performance.now();

    const tick = (frameTime: number) => {
      const elapsedSeconds = (frameTime - previousFrameTime) / 1000;
      previousFrameTime = frameTime;
      setCurrentTime((previousTime) =>
        advanceTimelineTime(previousTime + elapsedSeconds * stepsPerSecond, stepCount, loop),
      );
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isPlaying, loop, stepCount, stepsPerSecond]);

  const setTime = useCallback(
    (nextTime: number) => {
      setCurrentTime(clampTimelineTime(nextTime, stepCount));
    },
    [stepCount],
  );

  const play = useCallback(() => {
    if (stepCount > 1) {
      setIsPlaying(true);
    }
  }, [stepCount]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (stepCount <= 1) {
      return;
    }

    setIsPlaying((previousState) => !previousState);
  }, [stepCount]);

  return useMemo(
    () => ({
      currentTime,
      hasTimeSeries: stepCount > 1,
      isPlaying,
      pause,
      play,
      setTime,
      stepCount,
      toggle,
    }),
    [currentTime, isPlaying, pause, play, setTime, stepCount, toggle],
  );
};
