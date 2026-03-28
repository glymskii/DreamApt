import { Injectable } from "@nestjs/common";
import OpenAI from "openai";

@Injectable()
export class AIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });
  }

  private async chat(systemPrompt: string, userMessage: string): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY not set, returning mock response");
      return this.getMockResponse(systemPrompt);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4096,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content || "";
    } catch (err) {
      console.error("OpenAI API error, falling back to mock:", (err as Error).message);
      return this.getMockResponse(systemPrompt);
    }
  }

  async expandSearchParams(interviewAnswers: Record<string, unknown>): Promise<{
    strictParams: Record<string, unknown>;
    expandedParams: Record<string, unknown>;
    explanation: string;
  }> {
    const systemPrompt = `Ты — эксперт по недвижимости Алматы. На основе параметров пользователя сгенерируй:
1. strictParams — прямой перевод ответов в фильтры поиска Krisha.kz
2. expandedParams — расширенные параметры (соседние районы, альтернативные планировки)
3. explanation — объяснение на русском, почему расширил поиск

Знания об Алматы:
- Бостандыкский граничит с Медеуским и Алмалинским
- Медеуский — премиум, горы, чистый воздух
- Ауэзовский — доступнее, улучшается инфраструктура
- Наурызбайский — новостройки, растущий район
- Если пользователь хочет 3 комнаты, предложи также большие 2-комнатные (70м²+) с потенциалом перепланировки
- Если бюджет ограничен, предложи соседние районы

Верни ТОЛЬКО валидный JSON без markdown.`;

    const result = await this.chat(
      systemPrompt,
      `Параметры пользователя: ${JSON.stringify(interviewAnswers)}`,
    );

    try {
      return JSON.parse(result);
    } catch {
      return {
        strictParams: interviewAnswers,
        expandedParams: interviewAnswers,
        explanation: "AI не смог расширить параметры, используются исходные.",
      };
    }
  }

  async scoreProperty(
    property: {
      complexName: string;
      district: string;
      address: string;
      lat: number;
      lng: number;
      price: number;
      rooms: number;
      areaTotal: number;
      buildingType: string;
      yearBuilt: number | null;
      condition: string;
    },
    userPrefs: {
      lifestyle: string[];
      commuteMinutes: number;
      commuteTrafficDirection: string;
      budgetMin: number;
      budgetMax: number;
    },
  ): Promise<{
    scoreInfrastructure: number;
    scoreLifestyle: number;
    scoreValue: number;
    explanation: string;
  }> {
    const systemPrompt = `Ты — аналитик недвижимости Алматы. Оцени квартиру по шкале 50-100:
- infrastructure_score: близость и качество инфраструктуры (школы, больницы, магазины, спортзалы, парки)
- lifestyle_score: соответствие образу жизни пользователя
- value_score: соотношение цена/качество для данного района

Учитывай знания об Алматы:
- Бостандыкский/Медеуский = премиум, хорошая инфраструктура
- Верхняя часть города (юг) = чистый воздух, но пробки к центру
- Ауэзовский/Турксибский = доступнее, развивающаяся инфраструктура

Верни ТОЛЬКО JSON: {"scoreInfrastructure": число, "scoreLifestyle": число, "scoreValue": число, "explanation": "текст"}`;

    const result = await this.chat(
      systemPrompt,
      `Квартира: ${JSON.stringify(property)}\nПредпочтения: ${JSON.stringify(userPrefs)}`,
    );

    try {
      const parsed = JSON.parse(result);
      // If it's the generic mock, enhance it with property-specific context
      if (parsed.explanation === "Mock оценка (API ключ не установлен)") {
        return this.generateContextualScoring(property, userPrefs);
      }
      return parsed;
    } catch {
      return this.generateContextualScoring(property, userPrefs);
    }
  }

  private generateContextualScoring(
    property: {
      complexName: string;
      district: string;
      address: string;
      price: number;
      rooms: number;
      areaTotal: number;
      buildingType: string;
      yearBuilt: number | null;
      condition: string;
    },
    userPrefs: {
      lifestyle: string[];
      commuteMinutes: number;
      commuteTrafficDirection: string;
      budgetMin: number;
      budgetMax: number;
    },
  ) {
    // District-based infrastructure scores
    const districtInfra: Record<string, number> = {
      "Бостандыкский": 85, "Медеуский": 88, "Алмалинский": 82,
      "Ауэзовский": 72, "Наурызбайский": 68, "Турксибский": 70,
      "Жетысуский": 71, "Алатауский": 65,
    };
    const infraBase = districtInfra[property.district] || 72;
    const infraScore = Math.min(100, infraBase + (property.yearBuilt && property.yearBuilt >= 2018 ? 5 : 0));

    // Lifestyle match
    const lifestyleKeywords = userPrefs.lifestyle || [];
    let lifestyleScore = 70;
    if (lifestyleKeywords.length > 0) {
      const premiumDistricts = ["Бостандыкский", "Медеуский", "Алмалинский"];
      if (premiumDistricts.includes(property.district)) {
        lifestyleScore = 78 + Math.floor(Math.random() * 10);
      } else {
        lifestyleScore = 65 + Math.floor(Math.random() * 12);
      }
    }

    // Value score
    let valueScore = 75;
    const pricePerSqm = property.price / (property.areaTotal || 1);
    if (property.price <= userPrefs.budgetMax * 0.8) {
      valueScore = 85;
    } else if (property.price <= userPrefs.budgetMax) {
      valueScore = 75;
    } else {
      valueScore = 60;
    }
    if (property.condition === "хорошее" || property.condition === "отличное") {
      valueScore = Math.min(100, valueScore + 5);
    }

    // Build contextual explanation
    const parts: string[] = [];
    const complexLabel = property.complexName || property.address || property.district;
    parts.push(`${complexLabel} — район ${property.district}.`);

    if (infraScore >= 80) {
      parts.push(`Развитая инфраструктура: школы, магазины, парки в пешей доступности.`);
    } else if (infraScore >= 70) {
      parts.push(`Средний уровень инфраструктуры, основные объекты доступны.`);
    } else {
      parts.push(`Инфраструктура развивается, некоторых объектов может не хватать.`);
    }

    if (userPrefs.commuteMinutes > 0) {
      if (userPrefs.commuteMinutes <= 25) {
        parts.push(`Удобная дорога до работы — ${userPrefs.commuteMinutes} мин.`);
      } else if (userPrefs.commuteMinutes <= 40) {
        parts.push(`Дорога до работы ${userPrefs.commuteMinutes} мин — приемлемо.`);
      } else {
        parts.push(`Дорога до работы ${userPrefs.commuteMinutes} мин — довольно далеко.`);
      }
    }

    if (property.yearBuilt && property.yearBuilt >= 2018) {
      parts.push(`Новостройка ${property.yearBuilt} г. — современные стандарты.`);
    }

    const priceFormatted = (property.price / 1_000_000).toFixed(1);
    parts.push(`Цена ${priceFormatted} млн тенге за ${property.areaTotal} м².`);

    return {
      scoreInfrastructure: infraScore,
      scoreLifestyle: lifestyleScore,
      scoreValue: valueScore,
      explanation: parts.join(" "),
    };
  }

  async generateCJM(
    property: {
      complexName: string;
      district: string;
      address: string;
      lat: number;
      lng: number;
      rooms: number;
      areaTotal: number;
      commuteMinutes: number;
      nearbyPlaces?: string;
    },
    userPrefs: {
      lifestyle: string[];
      workLocation: { lat: number; lng: number; label: string };
      commuteMode: string;
    },
  ): Promise<
    Array<{
      scenarioType: string;
      title: string;
      summary: string;
      detail: string;
      timeSlot: string;
      tags: string[];
      matchScore: number;
    }>
  > {
    const nearbySection = property.nearbyPlaces
      ? `\n\nРЕАЛЬНЫЕ ближайшие объекты (данные 2GIS, используй ТОЛЬКО их):\n${property.nearbyPlaces}`
      : "";

    const systemPrompt = `Ты создаёшь Customer Journey Maps (сценарии жизни) для конкретной квартиры в Алматы.

ВАЖНО: Используй ТОЛЬКО реальные объекты из списка ниже. НЕ придумывай объекты, которых нет рядом с квартирой. Указывай реальные расстояния.

Сгенерируй 3 сценария будних дней и 3 сценария выходных.
Каждый сценарий:
- scenarioType: "weekday" или "weekend"
- title: короткое название на русском (напр. "Утренняя пробежка в парке")
- summary: 2-3 предложения для карточки. Указывай реальное расстояние до объекта.
- detail: полное описание 3-5 абзацев для drill-down. Используй только объекты из списка ниже.
- timeSlot: "morning" | "afternoon" | "evening"
- tags: массив тегов (fitness, parks, cafes, commute, shopping, schools, nightlife)
- matchScore: насколько квартира подходит для этого сценария (50-100)${nearbySection}

Верни ТОЛЬКО валидный JSON массив без markdown.`;

    const result = await this.chat(
      systemPrompt,
      `Квартира: ${JSON.stringify({ ...property, nearbyPlaces: undefined })}\nПредпочтения: ${JSON.stringify(userPrefs)}`,
    );

    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      return this.generateContextualCJM(property, userPrefs);
    } catch {
      return this.generateContextualCJM(property, userPrefs);
    }
  }

  private generateContextualCJM(
    property: {
      complexName: string;
      district: string;
      address: string;
      lat: number;
      lng: number;
      rooms: number;
      areaTotal: number;
      commuteMinutes: number;
      nearbyPlaces?: string;
    },
    userPrefs: {
      lifestyle: string[];
      workLocation: { lat: number; lng: number; label: string };
      commuteMode: string;
    },
  ) {
    const district = property.district || "Алматы";
    const complex = property.complexName || "жилой комплекс";
    const commute = property.commuteMinutes || 30;
    const workLabel = userPrefs.workLocation?.label || "место работы";
    const mode = userPrefs.commuteMode === "public_transport" ? "общественном транспорте" : "на машине";

    // Parse real nearby places from 2GIS data
    const local = this.parseNearbyPlaces(property.nearbyPlaces || "");

    return [
      {
        scenarioType: "weekday",
        title: "Утренний маршрут на работу",
        summary: `Выезд из ${complex} до ${workLabel} займёт около ${commute} минут ${mode}.${local.cafes[0] ? ` По пути — ${local.cafes[0].name}.` : ""}`,
        detail: `Утро начинается в ${complex}, район ${district}. Вы выходите из дома в 8:00, дорога до ${workLabel} занимает около ${commute} минут ${mode}.\n\n${local.cafes[0] ? `По пути можно заехать за кофе в ${local.cafes[0].name} (${local.cafes[0].dist}).` : "По пути множество кофеен."}\n\nВечером обратная дорога обычно чуть длиннее из-за вечернего потока.`,
        timeSlot: "morning",
        tags: ["commute"],
        matchScore: commute <= 30 ? 85 : commute <= 45 ? 72 : 60,
      },
      {
        scenarioType: "weekday",
        title: `Вечерний фитнес${local.gyms[0] ? ` — ${local.gyms[0].name}` : ""}`,
        summary: `${local.gyms[0] ? `${local.gyms[0].name} (${local.gyms[0].dist}) — ` : "Спортзал рядом — "}отличный вариант для вечерней тренировки после работы.`,
        detail: `После рабочего дня вы отправляетесь на тренировку.${local.gyms[0] ? `\n\n${local.gyms[0].name} находится в ${local.gyms[0].dist} от ${complex}.` : ""}${local.gyms[1] ? ` Альтернатива — ${local.gyms[1].name} (${local.gyms[1].dist}).` : ""}\n\n${local.cafes[1] ? `После тренировки можно поужинать в ${local.cafes[1].name} (${local.cafes[1].dist}).` : "После тренировки — лёгкий ужин в одном из ближайших кафе."}`,
        timeSlot: "evening",
        tags: ["fitness"],
        matchScore: local.gyms.length > 0 ? 82 : 68,
      },
      {
        scenarioType: "weekday",
        title: `Ужин${local.cafes[0] ? ` в ${local.cafes[0].name}` : " в ресторане"}`,
        summary: `${local.cafes[0] ? `${local.cafes[0].name} — всего в ${local.cafes[0].dist} от дома.` : "Множество кафе и ресторанов рядом."}${local.cafes[1] ? ` Также рядом ${local.cafes[1].name}.` : ""}`,
        detail: `Вечером после работы вы решаете поужинать вне дома.${local.cafes[0] ? `\n\n${local.cafes[0].name} (${local.cafes[0].dist}${local.cafes[0].addr ? ", " + local.cafes[0].addr : ""}) — отличный выбор рядом с ${complex}.` : ""}\n\n${local.cafes.length > 1 ? `Также доступны: ${local.cafes.slice(1, 3).map(c => `${c.name} (${c.dist})`).join(", ")}.` : "В районе представлен широкий выбор кухонь."}\n\nМожно также заказать доставку через Glovo или Wolt.`,
        timeSlot: "evening",
        tags: ["cafes"],
        matchScore: local.cafes.length >= 2 ? 80 : 70,
      },
      {
        scenarioType: "weekend",
        title: `${local.parks[0] ? `Прогулка — ${local.parks[0].name}` : "Утренняя прогулка"}`,
        summary: `${local.parks[0] ? `${local.parks[0].name} (${local.parks[0].dist}) — отличное место для утренней прогулки или пробежки.` : "Утренняя прогулка по району."}`,
        detail: `Субботнее утро. Вы выходите из ${complex}.${local.parks[0] ? `\n\n${local.parks[0].name} находится в ${local.parks[0].dist}${local.parks[0].addr ? " (" + local.parks[0].addr + ")" : ""}. Здесь можно провести пару часов, наслаждаясь природой и свежим воздухом.` : ""}\n\n${local.parks[1] ? `Также неподалёку — ${local.parks[1].name} (${local.parks[1].dist}).` : ""}${local.cafes[0] ? `\n\nПо пути обратно — завтрак в ${local.cafes[0].name}.` : ""}`,
        timeSlot: "morning",
        tags: ["parks", "fitness"],
        matchScore: local.parks.length > 0 ? 85 : 65,
      },
      {
        scenarioType: "weekend",
        title: `${local.malls[0] ? `Шоппинг — ${local.malls[0].name}` : "Шоппинг"}`,
        summary: `${local.malls[0] ? `${local.malls[0].name} (${local.malls[0].dist}) — магазины, кинотеатр, фудкорт.` : "Торговые центры в доступности."}`,
        detail: `В субботу после обеда — шоппинг.${local.malls[0] ? `\n\n${local.malls[0].name} находится в ${local.malls[0].dist} от ${complex}${local.malls[0].addr ? " (" + local.malls[0].addr + ")" : ""}. Магазины, кинотеатр, фудкорт — всё для выходного дня.` : ""}${local.malls[1] ? `\n\nТакже рядом — ${local.malls[1].name} (${local.malls[1].dist}).` : ""}`,
        timeSlot: "afternoon",
        tags: ["shopping"],
        matchScore: local.malls.length > 0 ? 78 : 65,
      },
      {
        scenarioType: "weekend",
        title: "Семейный день",
        summary: `${complex} — ${property.rooms}-комн., ${property.areaTotal} м².${local.parks[0] ? ` Рядом ${local.parks[0].name}.` : ""}${local.schools[0] ? ` Школа в ${local.schools[0].dist}.` : ""}`,
        detail: `Воскресенье — день для семьи. Утром — завтрак дома в просторной квартире ${property.rooms}-комн. (${property.areaTotal} м²) в ${complex}.${local.parks.length > 0 ? `\n\nДнём — прогулка в ${local.parks[0].name} (${local.parks[0].dist}), где есть детские площадки и зоны отдыха.` : ""}${local.schools[0] ? `\n\nДля семей с детьми: ${local.schools[0].name} в ${local.schools[0].dist}${local.schools[0].addr ? " (" + local.schools[0].addr + ")" : ""}.` : ""}${local.hospitals[0] ? ` Поликлиника: ${local.hospitals[0].name} (${local.hospitals[0].dist}).` : ""}`,
        timeSlot: "afternoon",
        tags: ["parks", "schools"],
        matchScore: local.schools.length > 0 && local.parks.length > 0 ? 80 : 70,
      },
    ];
  }

  /** Parse nearby places text from 2GIS into structured data */
  private parseNearbyPlaces(text: string): {
    parks: { name: string; dist: string; addr: string }[];
    gyms: { name: string; dist: string; addr: string }[];
    cafes: { name: string; dist: string; addr: string }[];
    malls: { name: string; dist: string; addr: string }[];
    schools: { name: string; dist: string; addr: string }[];
    hospitals: { name: string; dist: string; addr: string }[];
  } {
    const result = {
      parks: [] as { name: string; dist: string; addr: string }[],
      gyms: [] as { name: string; dist: string; addr: string }[],
      cafes: [] as { name: string; dist: string; addr: string }[],
      malls: [] as { name: string; dist: string; addr: string }[],
      schools: [] as { name: string; dist: string; addr: string }[],
      hospitals: [] as { name: string; dist: string; addr: string }[],
    };

    if (!text) return result;

    const categoryMap: Record<string, keyof typeof result> = {
      "Парки": "parks",
      "Фитнес": "gyms",
      "Кафе": "cafes",
      "ТРЦ": "malls",
      "Школы": "schools",
      "Больницы": "hospitals",
    };

    for (const line of text.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const label = line.substring(0, colonIdx).trim();
      const items = line.substring(colonIdx + 1).trim();

      let category: keyof typeof result | undefined;
      for (const [key, val] of Object.entries(categoryMap)) {
        if (label.includes(key)) {
          category = val;
          break;
        }
      }
      if (!category) continue;

      // Parse items like: "Name (500 м, address); Name2 (1.2 км)"
      const parts = items.split(";");
      for (const part of parts) {
        const match = part.trim().match(/^(.+?)\s*\((.+?)\)\s*$/);
        if (match) {
          const name = match[1].trim();
          const info = match[2];
          // Extract distance and address from info
          const distMatch = info.match(/(\d+(?:\.\d+)?\s*(?:м|км))/);
          const dist = distMatch ? distMatch[1] : "";
          const addr = info.replace(/\d+(?:\.\d+)?\s*(?:м|км),?\s*/, "").trim();
          result[category].push({ name, dist, addr });
        }
      }
    }

    return result;
  }

  private getMockResponse(systemPrompt: string): string {
    if (systemPrompt.includes("expandSearchParams") || systemPrompt.includes("фильтры поиска")) {
      return JSON.stringify({
        strictParams: {},
        expandedParams: {},
        explanation: "Mock: параметры не расширены (API ключ не установлен)",
      });
    }
    if (systemPrompt.includes("scoreProperty") || systemPrompt.includes("аналитик недвижимости")) {
      return JSON.stringify({
        scoreInfrastructure: 75,
        scoreLifestyle: 70,
        scoreValue: 72,
        explanation: "Mock оценка (API ключ не установлен)",
      });
    }
    if (systemPrompt.includes("Journey Maps") || systemPrompt.includes("сценарии жизни")) {
      // Return empty array so generateCJM falls through to contextual generator
      return JSON.stringify([]);
    }
    return "{}";
  }
}
