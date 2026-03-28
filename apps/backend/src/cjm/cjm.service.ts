import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CJMScenarioEntity } from "../database/entities/cjm-scenario.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { AIService } from "../ai/ai.service";
import { NearbyPlacesService } from "./nearby-places.service";

@Injectable()
export class CJMService {
  private readonly logger = new Logger(CJMService.name);

  constructor(
    @InjectRepository(CJMScenarioEntity)
    private cjmRepo: Repository<CJMScenarioEntity>,
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
    @InjectRepository(SearchProjectEntity)
    private projectsRepo: Repository<SearchProjectEntity>,
    private aiService: AIService,
    private nearbyPlaces: NearbyPlacesService,
  ) {}

  async getOrGenerate(propertyId: string) {
    // Check if already generated
    const existing = await this.cjmRepo.find({ where: { propertyId } });
    if (existing.length > 0) {
      return {
        weekday: existing.filter((s) => s.scenarioType === "weekday"),
        weekend: existing.filter((s) => s.scenarioType === "weekend"),
      };
    }

    // Lazy generate
    const property = await this.propertiesRepo.findOne({
      where: { id: propertyId },
    });
    if (!property) {
      return { weekday: [], weekend: [] };
    }

    const project = await this.projectsRepo.findOne({
      where: { id: property.projectId },
    });
    const interviewAnswers = (project?.interviewAnswers || {}) as Record<string, unknown>;

    // Fetch REAL nearby places from 2GIS
    const lat = Number(property.lat) || 43.238;
    const lng = Number(property.lng) || 76.945;

    let nearbyText = "";
    let allNearbyPlaces: { name: string; category: string; distanceMeters: number; address: string }[] = [];
    try {
      const places = await this.nearbyPlaces.findNearby(lat, lng);
      nearbyText = this.nearbyPlaces.formatForPrompt(places);
      // Flatten all places for storage
      allNearbyPlaces = [
        ...places.parks,
        ...places.gyms,
        ...places.cafes,
        ...places.malls,
        ...places.schools,
        ...places.hospitals,
      ];
      this.logger.log(`Found nearby places for ${property.complexName}: ${nearbyText.substring(0, 200)}...`);
    } catch (err) {
      this.logger.warn(`Failed to fetch nearby places: ${err}`);
    }

    try {
      const scenarios = await this.aiService.generateCJM(
        {
          complexName: property.complexName,
          district: property.district,
          address: property.address,
          lat,
          lng,
          rooms: property.rooms,
          areaTotal: Number(property.areaTotal),
          commuteMinutes: property.commuteMinutes || 0,
          nearbyPlaces: nearbyText,
        },
        {
          lifestyle: (interviewAnswers.lifestyle as string[]) || [],
          workLocation: (interviewAnswers.workLocation as { lat: number; lng: number; label: string }) || {
            lat: 43.238,
            lng: 76.945,
            label: "",
          },
          commuteMode: (interviewAnswers.commuteMode as string) || "car",
        },
      );

      if (!scenarios || scenarios.length === 0) {
        this.logger.warn(`No CJM scenarios generated for property ${propertyId}`);
        return { weekday: [], weekend: [] };
      }

      // Save to DB (include nearby places for 2GIS linking)
      const saved = await Promise.all(
        scenarios.map((s) =>
          this.cjmRepo.save({
            propertyId,
            scenarioType: s.scenarioType,
            title: s.title,
            summary: s.summary,
            detail: s.detail,
            timeSlot: s.timeSlot,
            tags: s.tags || [],
            matchScore: s.matchScore || 70,
            nearbyPlaces: allNearbyPlaces.length > 0 ? allNearbyPlaces : null,
          }),
        ),
      );

      return {
        weekday: saved.filter((s) => s.scenarioType === "weekday"),
        weekend: saved.filter((s) => s.scenarioType === "weekend"),
      };
    } catch (err) {
      this.logger.error(`CJM generation failed for property ${propertyId}:`, err);
      return { weekday: [], weekend: [] };
    }
  }
}
