import type { TrafficDirection } from "../constants/scoring";

export interface Property {
  id: string;
  projectId: string;
  krishaId: string;
  krishaUrl: string;
  title: string;
  price: number;
  rooms: number;
  areaTotal: number;
  areaLiving?: number;
  areaKitchen?: number;
  floor: number;
  floorTotal: number;
  buildingType: string;
  yearBuilt?: number;
  condition?: string;
  district: string;
  address: string;
  complexName: string;
  lat: number;
  lng: number;
  phone?: string;
  sellerType?: string;
  photos: string[];
  description?: string;
  scoreTotal: number;
  scoreCommute: number;
  scoreInfrastructure: number;
  scoreLifestyle: number;
  scoreValue: number;
  commuteMinutes: number;
  commuteTrafficDirection: TrafficDirection;
  scoringExplanation?: string;
  groupId?: string;
  isPrimary: boolean;
  duplicateCount?: number;
  isWishlisted?: boolean;
  createdAt: string;
}

export interface PropertyListResponse {
  properties: Property[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CJMScenario {
  id: string;
  propertyId: string;
  scenarioType: "weekday" | "weekend";
  title: string;
  summary: string;
  detail?: string;
  timeSlot: "morning" | "afternoon" | "evening";
  tags: string[];
  matchScore: number;
}

export interface CJMResponse {
  weekday: CJMScenario[];
  weekend: CJMScenario[];
}

export interface DrilldownResponse {
  scenario: CJMScenario;
  similarProperties: Property[];
}
