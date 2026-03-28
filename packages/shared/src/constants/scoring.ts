export const SCORING_WEIGHTS = {
  commute: 0.35,
  infrastructure: 0.25,
  lifestyle: 0.25,
  value: 0.15,
} as const;

export const TRAFFIC_DIRECTION = {
  with_traffic: "with_traffic",
  against_traffic: "against_traffic",
  neutral: "neutral",
} as const;

export type TrafficDirection =
  (typeof TRAFFIC_DIRECTION)[keyof typeof TRAFFIC_DIRECTION];
