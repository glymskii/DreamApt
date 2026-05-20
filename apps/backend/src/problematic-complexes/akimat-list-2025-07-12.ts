/**
 * Snapshot of the Almaty Akimat / УГАСК "проблемные ЖК" list published
 * on 2025-07-12 — 28 objects across 5 districts.
 *
 * Source:
 *   https://www.gov.kz/memleket/entities/almaty/press/news/details/1033578
 *   (УГАСК press release feed:
 *    https://www.gov.kz/memleket/entities/almaty-ugask/press/news)
 *
 * Used by ProblematicComplexesService.syncFromAkimatList on admin trigger.
 *
 * Update procedure when УГАСК publishes a new list:
 *   1. Create a new file akimat-list-YYYY-MM-DD.ts mirroring this shape
 *   2. Update the import in problematic-complexes.service.ts
 *   3. Admin clicks "Импортировать" in /admin → ProblematicComplexes tab
 *
 * `name` is exactly what the akimat published — including the "ЖК"/"МЖК"/
 * "Клубный дом" prefix — so our fuzzy matcher can strip the prefix and
 * compare to displayName. `address` is verbatim so admins can verify
 * ambiguous matches.
 */
export interface AkimatProblematicItem {
  name: string;
  district: string;
  address: string;
}

export interface AkimatProblematicSnapshot {
  publishedAt: string;
  sourceUrl: string;
  reasonGeneric: string;
  items: AkimatProblematicItem[];
}

export const AKIMAT_PROBLEMATIC_2025_07_12: AkimatProblematicSnapshot = {
  publishedAt: "2025-07-12",
  sourceUrl:
    "https://www.gov.kz/memleket/entities/almaty/press/news/details/1033578?lang=ru",
  reasonGeneric:
    "Объект не имеет полного пакета разрешительных документов на строительство, либо возводится с отклонениями от проекта (по данным Управления государственного архитектурно-строительного контроля Алматы).",
  items: [
    // Алатауский (2)
    { name: "ЖК Питтсбург", district: "Алатауский", address: "мкр. Дархан, ул. Сабатаева, 24" },
    { name: "МЖК Достар Deluxe", district: "Алатауский", address: "мкр. Мадениет, 185/8" },

    // Алмалинский (4)
    { name: "ЖК Auezov Apartaments", district: "Алмалинский", address: "ул. Карасай батыра, 183/19" },
    { name: "ЖК Tole bi Residence", district: "Алмалинский", address: "ул. Аносова, 103 Б" },
    { name: "ЖК Кабанбай батыр", district: "Алмалинский", address: "квадрат улиц Исаева, Кабанбай батыра, Байганина, Карасай батыра" },
    { name: "ЖК M-Park (2 очередь)", district: "Алмалинский", address: "ул. Ауэзова, 2/8" },

    // Бостандыкский (10 именованных + 1 без названия = 11)
    { name: "ЖК Швейцария", district: "Бостандыкский", address: "мкр. Нурлытау, участки 1480/1, 1480/10, 1480/8, 1480/6, 1480/23, 1480/22" },
    { name: "Клубный дом Rich", district: "Бостандыкский", address: "мкр. Мирас, 24/1, 24/2" },
    { name: "ЖК 7 Avenue", district: "Бостандыкский", address: "мкр. Ремизовка, переулок 7, участки 71, 73, 75" },
    { name: "МЖД без названия (ул. Жангир хана, 46)", district: "Бостандыкский", address: "мкр. Ерменсай, ул. Жангир хана, 46" },
    { name: "ЖК Evim novo", district: "Бостандыкский", address: "мкр. Каргалы, ул. Кенесары хана, 85/3" },
    { name: "ЖК Barakat", district: "Бостандыкский", address: "мкр. Нур-Алатау, ул. Тауасарулы, участки 71/5, 71/6" },
    { name: "ЖК Montblanc", district: "Бостандыкский", address: "мкр. Ерменсай, переулок 7, участок 8" },
    { name: "Строительство жилых домов (Горный Гигант 596/4)", district: "Бостандыкский", address: "ПК Горный Гигант, участок 596/4" },
    { name: "Садовые дома (Жанару 556)", district: "Бостандыкский", address: "ПК Жанару, участок 556" },
    { name: "ЖК Alatau park", district: "Бостандыкский", address: "мкр. Нур-Алатау, ул. Баязитовой, участок 13" },
    { name: "МЖК Баганашыл", district: "Бостандыкский", address: "с/т Мамыр, участки 138/2, 138/3, 138/4, 138/5" },

    // Медеуский (6)
    { name: "Клубный дом Sky Club House", district: "Медеуский", address: "ул. Фонвизина, 28" },
    { name: "Клубный дом Maison", district: "Медеуский", address: "ул. Шашкина, 42/1" },
    { name: "Клубный дом Pine Hill Residence", district: "Медеуский", address: "ул. 2, участок 33" },
    { name: "Клубный дом Alma Garden", district: "Медеуский", address: "ул. 6, участки 7, 9" },
    { name: "МЖД без названия (ул. Нурмагамбетова, 374/1)", district: "Медеуский", address: "ул. Нурмагамбетова, 374/1" },
    { name: "Клубный дом Compositor", district: "Медеуский", address: "ул. Жамакаева, участок 108" },

    // Наурызбайский (4 именованных + 1 без названия = 5)
    { name: "ЖК Люксембург", district: "Наурызбайский", address: "мкр. Каргалы, ул. Кали Надырова, участки 71, 73, 75" },
    { name: "ЖК Flora", district: "Наурызбайский", address: "мкр. Тастыбулак, ул. Таутаган, участки 6, 8, 10" },
    { name: "ЖК Lantana", district: "Наурызбайский", address: "Большой алматинский сельский округ" },
    { name: "ЖК Французский дом", district: "Наурызбайский", address: "мкр. Карагайлы, АХК Чапаево, участок 426" },
    { name: "МЖК без названия (ул. Кенесары хана, 98)", district: "Наурызбайский", address: "ул. Кенесары хана, участок 98" },
  ],
};
