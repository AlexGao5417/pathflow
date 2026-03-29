import type { FlowStats, FlowStatsOptions, PreparedFlowData } from "../types/flow-types";
import {
  formatTimeStepLabel,
  getCurrentStepIndex,
  getInterpolatedSeriesValue,
} from "../utils/flow-utils";

export const getFlowStats = (
  preparedData: PreparedFlowData | null | undefined,
  options: FlowStatsOptions = {},
): FlowStats => {
  if (!preparedData) {
    return {
      activeCount: 0,
      activeLinks: 0,
      clockLabel: null,
      currentStepIndex: 0,
      hasTimeSeries: false,
      totalValue: 0,
    };
  }

  const currentTime = options.currentTime ?? 0;
  const currentStepIndex = getCurrentStepIndex(preparedData.stepCount, currentTime);
  const countSource =
    options.countMode === "entities"
      ? preparedData.scaledEntityTotalsByStep
      : preparedData.scaledParticleTotalsByStep;

  return {
    activeCount: Math.round(getInterpolatedSeriesValue(countSource, currentTime)),
    activeLinks: Math.round(getInterpolatedSeriesValue(preparedData.activeLinksByStep, currentTime)),
    clockLabel: preparedData.hasTimeSeries
      ? formatTimeStepLabel(preparedData.timeSteps, currentStepIndex)
      : null,
    currentStepIndex,
    hasTimeSeries: preparedData.hasTimeSeries,
    totalValue: Math.round(getInterpolatedSeriesValue(preparedData.totalsByStep, currentTime) * 100) / 100,
  };
};
