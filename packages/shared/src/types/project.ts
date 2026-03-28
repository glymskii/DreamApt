import type { AlmatyDistrict } from "../constants/districts";
import type { BuildingType, ConditionType } from "../constants/housing-types";
import type { CommuteMode, LifestyleOption } from "../constants/lifestyle";
import type { DeveloperFilter } from "../constants/developers";

export type ProjectStatus =
  | "draft"
  | "interview_complete"
  | "searching"
  | "scoring"
  | "scored"
  | "complete";

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface ProximityLocation {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface InterviewAnswers {
  districts: AlmatyDistrict[];
  rooms: number[];
  buildingType: BuildingType[];
  condition: ConditionType[];
  areaMin: number;
  areaMax: number;
  workLocation: GeoPoint;
  commuteMode: CommuteMode;
  commuteMaxMinutes: number;
  lifestyle: LifestyleOption[];
  proximityLocations?: ProximityLocation[];
  budgetMin: number;
  budgetMax: number;
  developerFilter?: DeveloperFilter;
}

export interface SearchProject {
  id: string;
  userId: string;
  name: string;
  status: ProjectStatus;
  interviewAnswers: InterviewAnswers | null;
  searchParams: Record<string, unknown> | null;
  aiSuggestions: string | null;
  propertyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
}

export interface UpdateInterviewRequest {
  answers: InterviewAnswers;
}
