import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PropertyEntity } from "../database/entities/property.entity";
import { CommuteService } from "../commute/commute.service";
import { AIService } from "../ai/ai.service";
import { findShutovRating } from "@dreamapt/shared";

const WEIGHTS = { commute: 0.35, infrastructure: 0.25, lifestyle: 0.25, value: 0.15 };

/** Shutov category → score adjustment (added to total 0-100 score) */
const SHUTOV_SCORE_ADJUSTMENT: Record<number, number> = {
  0: +5,  // exemplary → bonus
  1: +3,  // nearly ideal → small bonus
  2: +1,  // quite good → tiny bonus
  3: 0,   // just okay → neutral
  4: -3,  // bare minimum → penalty
  5: -7,  // should not have been built → significant penalty
};

@Injectable()
export class ScoringService {
  constructor(
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
    private commuteService: CommuteService,
    private aiService: AIService,
  ) {}

  async scoreProperties(
    projectId: string,
    interviewAnswers: Record<string, unknown>,
  ): Promise<void> {
    const properties = await this.propertiesRepo.find({
      where: { projectId, isPrimary: true },
    });

    const workLocation = interviewAnswers.workLocation as {
      lat: number;
      lng: number;
      label: string;
    };
    const commuteMode = (interviewAnswers.commuteMode as string) || "car";
    const lifestyle = (interviewAnswers.lifestyle as string[]) || [];
    const budgetMin = (interviewAnswers.budgetMin as number) || 0;
    const budgetMax = (interviewAnswers.budgetMax as number) || 999999999;

    // Process in batches of 5 to avoid overwhelming the AI API
    const batchSize = 5;
    for (let i = 0; i < properties.length; i += batchSize) {
      const batch = properties.slice(i, i + batchSize);
      await Promise.all(
        batch.map((property) =>
          this.scoreProperty(property, workLocation, commuteMode, lifestyle, budgetMin, budgetMax),
        ),
      );
    }
  }

  /**
   * Re-score a single property by ID
   */
  async rescoreSingleProperty(
    propertyId: string,
    interviewAnswers: Record<string, unknown>,
  ): Promise<void> {
    const property = await this.propertiesRepo.findOne({ where: { id: propertyId } });
    if (!property) return;

    const workLocation = interviewAnswers.workLocation as {
      lat: number;
      lng: number;
      label: string;
    };
    const commuteMode = (interviewAnswers.commuteMode as string) || "car";
    const lifestyle = (interviewAnswers.lifestyle as string[]) || [];
    const budgetMin = (interviewAnswers.budgetMin as number) || 0;
    const budgetMax = (interviewAnswers.budgetMax as number) || 999999999;

    await this.scoreProperty(property, workLocation, commuteMode, lifestyle, budgetMin, budgetMax);
  }

  private async scoreProperty(
    property: PropertyEntity,
    workLocation: { lat: number; lng: number; label: string },
    commuteMode: string,
    lifestyle: string[],
    budgetMin: number,
    budgetMax: number,
  ): Promise<void> {
    // 1. Commute score (deterministic)
    let commuteScore = 70;
    let commuteMinutes = 0;
    let trafficDirection = "neutral";

    if (property.lat && property.lng && workLocation.lat && workLocation.lng) {
      const commute = await this.commuteService.getCommute(
        property.lat,
        property.lng,
        workLocation.lat,
        workLocation.lng,
        commuteMode,
      );
      commuteMinutes = commute.minutes;
      trafficDirection = commute.trafficDirection;

      // Base score from commute time
      if (commuteMinutes <= 15) commuteScore = 97;
      else if (commuteMinutes <= 25) commuteScore = 90;
      else if (commuteMinutes <= 35) commuteScore = 80;
      else if (commuteMinutes <= 45) commuteScore = 70;
      else commuteScore = Math.max(50, 65 - (commuteMinutes - 45));

      // Traffic direction bonus
      if (trafficDirection === "against_traffic") commuteScore = Math.min(100, commuteScore + 10);
      else if (trafficDirection === "neutral") commuteScore = Math.min(100, commuteScore + 5);
    }

    // 2. AI scores (infrastructure, lifestyle, value)
    let aiScores = {
      scoreInfrastructure: 70,
      scoreLifestyle: 70,
      scoreValue: 70,
      explanation: "",
    };

    try {
      aiScores = await this.aiService.scoreProperty(
        {
          complexName: property.complexName,
          district: property.district,
          address: property.address,
          lat: Number(property.lat),
          lng: Number(property.lng),
          price: Number(property.price),
          rooms: property.rooms,
          areaTotal: Number(property.areaTotal),
          buildingType: property.buildingType,
          yearBuilt: property.yearBuilt,
          condition: property.condition,
        },
        {
          lifestyle,
          commuteMinutes,
          commuteTrafficDirection: trafficDirection,
          budgetMin,
          budgetMax,
        },
      );
    } catch (err) {
      console.error(`AI scoring failed for property ${property.id}:`, err);
    }

    // 3. Total weighted score + Shutov expert adjustment
    let scoreTotal =
      commuteScore * WEIGHTS.commute +
      aiScores.scoreInfrastructure * WEIGHTS.infrastructure +
      aiScores.scoreLifestyle * WEIGHTS.lifestyle +
      aiScores.scoreValue * WEIGHTS.value;

    const shutovRating = findShutovRating(property.complexName || "");
    if (shutovRating) {
      const adjustment = SHUTOV_SCORE_ADJUSTMENT[shutovRating.category] ?? 0;
      scoreTotal = Math.max(0, Math.min(100, scoreTotal + adjustment));
    }

    // 4. Save
    await this.propertiesRepo.update(property.id, {
      scoreTotal: Math.round(scoreTotal * 100) / 100,
      scoreCommute: commuteScore,
      scoreInfrastructure: aiScores.scoreInfrastructure,
      scoreLifestyle: aiScores.scoreLifestyle,
      scoreValue: aiScores.scoreValue,
      commuteMinutes,
      commuteTrafficDirection: trafficDirection,
      scoringExplanation: aiScores.explanation,
    });
  }
}
