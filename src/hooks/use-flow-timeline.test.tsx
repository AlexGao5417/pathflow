import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFlowTimeline } from "./use-flow-timeline";

const TimelineProbe = () => {
  const timeline = useFlowTimeline({
    autoPlay: false,
    initialTime: -2,
    stepCount: 4,
  });

  return (
    <>
      <div data-testid="time">{timeline.currentTime}</div>
      <div data-testid="playing">{String(timeline.isPlaying)}</div>
      <button type="button" onClick={() => timeline.setTime(7.2)}>
        set
      </button>
      <button type="button" onClick={timeline.play}>
        play
      </button>
      <button type="button" onClick={timeline.pause}>
        pause
      </button>
      <button type="button" onClick={timeline.toggle}>
        toggle
      </button>
    </>
  );
};

describe("useFlowTimeline", () => {
  it("clamps time and exposes manual playback controls", () => {
    render(<TimelineProbe />);

    expect(screen.getByTestId("time")).toHaveTextContent("0");
    expect(screen.getByTestId("playing")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("set"));
    expect(screen.getByTestId("time")).toHaveTextContent("3");

    fireEvent.click(screen.getByText("play"));
    expect(screen.getByTestId("playing")).toHaveTextContent("true");

    fireEvent.click(screen.getByText("pause"));
    expect(screen.getByTestId("playing")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("playing")).toHaveTextContent("true");
  });
});
