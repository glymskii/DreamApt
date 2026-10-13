import { strict as assert } from "node:assert";
import {
  parseCompletion,
  findCompletionInText,
  parseConstructionStatus,
  parseHousingClass,
  parseCatalogPage,
  completedLongAgo,
  parseComplexDetail,
  floorSegmentFor,
} from "../src/complex/krisha-complex-html";

// Fixed clock: plausibility windows depend on the current year.
const NOW = new Date("2026-10-13T00:00:00Z");

function completionTests() {
  assert.deepEqual(parseCompletion("III квартал 2026 г.", NOW), { year: 2026, quarter: 3 });
  assert.deepEqual(parseCompletion("4 кв. 2026", NOW), { year: 2026, quarter: 4 });
  assert.deepEqual(parseCompletion("IV кв.2027", NOW), { year: 2027, quarter: 4 });
  assert.deepEqual(parseCompletion("2-й квартал 2027 года", NOW), { year: 2027, quarter: 2 });
  assert.deepEqual(parseCompletion("IV-квартал 2026", NOW), { year: 2026, quarter: 4 });
  assert.deepEqual(parseCompletion("ІІІ квартал 2026", NOW), { year: 2026, quarter: 3 }, "Cyrillic І numerals");
  assert.deepEqual(parseCompletion("2027 г.", NOW), { year: 2027, quarter: null });
  assert.deepEqual(parseCompletion("II полугодие 2027", NOW), { year: 2027, quarter: 4 });
  // Multi-phase: the complex is finished with its last phase.
  assert.deepEqual(
    parseCompletion("1 очередь — II квартал 2025 г., 2 очередь — IV квартал 2026 г.", NOW),
    { year: 2026, quarter: 4 },
  );
  assert.deepEqual(
    parseCompletion("1 и 2 очереди — IV квартал 2026 г.; 3 очередь — III квартал 2027 г.", NOW),
    { year: 2027, quarter: 3 },
  );
  assert.deepEqual(parseCompletion("1 очередь — IV кв. 2025, 2 очередь — 2026 г.", NOW), { year: 2026, quarter: null });
  // «2-я очередь» is not a quarter.
  assert.deepEqual(parseCompletion("2-я очередь — III кв. 2026", NOW), { year: 2026, quarter: 3 });
  assert.equal(parseCompletion("Сдан", NOW), null);
  assert.equal(parseCompletion("уточняется", NOW), null);
  assert.equal(parseCompletion("2099 г.", NOW), null, "implausibly far future");
  assert.equal(parseCompletion("12 кв. м", NOW), null);

  // Free text (catalog cards): bare years only after a deadline keyword.
  assert.deepEqual(findCompletionInText("ЖК Diamond от 45 000 000 〒 Сдача III кв. 2027", NOW), { year: 2027, quarter: 3 });
  assert.deepEqual(findCompletionInText("ЖК Flora Строящийся Сдача 2027", NOW), { year: 2027, quarter: null });
  assert.equal(findCompletionInText("ЖК 2028 от 20 250 000 〒 до 2030 м²", NOW), null);
  assert.equal(findCompletionInText("от 350 000 тг/кв.м 2026", NOW), null);
}

function statusAndClassTests() {
  assert.equal(parseConstructionStatus("Строящийся"), "under_construction");
  assert.equal(parseConstructionStatus("Строится"), "under_construction");
  assert.equal(parseConstructionStatus("Сдан в эксплуатацию"), "completed");
  assert.equal(parseConstructionStatus("Введён в эксплуатацию"), "completed");
  assert.equal(parseConstructionStatus("Продажи завершены"), null);
  assert.equal(parseConstructionStatus("Дом не сдан"), null);
  assert.equal(parseConstructionStatus("Сдача в IV кв. 2026"), null);
  assert.equal(parseConstructionStatus(""), null);

  assert.equal(parseHousingClass("Комфорт"), "comfort");
  assert.equal(parseHousingClass("комфорт+"), "comfort");
  assert.equal(parseHousingClass("Бизнес"), "business");
  assert.equal(parseHousingClass("Элитный"), "premium");
  assert.equal(parseHousingClass("Премиум"), "premium");
  assert.equal(parseHousingClass("эконом"), "economy");
  assert.equal(parseHousingClass("Монолит"), null);

  assert.equal(floorSegmentFor(5), "low_rise");
  assert.equal(floorSegmentFor(9), "mid_rise");
  assert.equal(floorSegmentFor(18), "high_rise");
  assert.equal(floorSegmentFor(30), "skyscraper");
  assert.equal(floorSegmentFor(null), null);

  // Krisha's stale «строящийся»: deadlines before last year are history.
  assert.equal(completedLongAgo(2008, NOW), true);
  assert.equal(completedLongAgo(2024, NOW), true);
  assert.equal(completedLongAgo(2025, NOW), false, "last year's overdue ЖК still count");
  assert.equal(completedLongAgo(2026, NOW), false);
  assert.equal(completedLongAgo(2028, NOW), false);
  assert.equal(completedLongAgo(null, NOW), false, "unknown deadline is not evidence");
  assert.equal(completedLongAgo(2025, new Date("2027-01-05T00:00:00Z")), true, "the boundary moves every January");
}

function catalogTests() {
  const html = `<html><head><title>Продажа квартир в строящемся доме в Алматы - Крыша</title></head>
  <body><h1>Квартиры в строящемся доме в Алматы</h1>
    <div class="complex-card" data-complex-id="101">
      <a href="/complex/show/almaty/neopark/" data-complex-id="101">
        <img src="https://krisha-photos.kcdn.online/neopark.jpg" alt="ЖК NEOPARK">
        <div class="complex-card__title">ЖК NEOPARK</div>
        <div class="complex-card__state">Строящийся</div>
        <div class="complex-card__deadline">Сдача III кв. 2027</div>
        <div class="complex-card__price-from">от 28 500 000 〒</div>
      </a>
    </div>
    <div class="complex-card" data-complex-id="102">
      <a href="https://krisha.kz/complex/show/almaty/flora/" data-complex-id="102">
        <img src="data:image/gif;base64,R0lGOD" alt="ЖК Flora">
        <div class="complex-card__state">Сдан в эксплуатацию</div>
      </a>
    </div>
    <a href="/complex/search/almaty/?state%5B%5D=1&page=3" data-complex-id="">ignored</a>
    <a href="/zastroyshik/bazisa/" data-complex-id="103">developer link, not a card</a>
    <nav><a href="/complex/search/almaty/?state%5B%5D=1&page=3">3</a></nav>
  </body></html>`;
  const page = parseCatalogPage(html, 2, NOW);
  assert.equal(page.cards.length, 2);
  assert.equal(page.hasNextPage, true);
  assert.match(page.heading, /строящ/i);
  const [neopark, flora] = page.cards;
  assert.equal(neopark.krishaComplexId, "101");
  assert.equal(neopark.name, "NEOPARK");
  assert.equal(neopark.krishaUrl, "https://krisha.kz/complex/show/almaty/neopark/");
  assert.equal(neopark.status, "under_construction");
  assert.deepEqual(neopark.completion, { year: 2027, quarter: 3 });
  assert.equal(neopark.photoUrl, "https://krisha-photos.kcdn.online/neopark.jpg");
  assert.equal(neopark.priceText, "от 28 500 000 〒");
  assert.equal(flora.status, "completed");
  assert.equal(flora.photoUrl, null, "lazy-load placeholder is not a photo");

  const last = parseCatalogPage(html, 3, NOW);
  assert.equal(last.hasNextPage, false);
  assert.equal(parseCatalogPage("<html><body>Проверка, что вы не робот</body></html>", 1, NOW).cardElements, 0);
}

// Trimmed from a real krisha.kz/complex/search/almaty/?state[]=1&page=2
// (October 2026): 12 div.complex-card per page, then the «Популярные
// новостройки» SEO block — 200 ЖК links, identical on every page and not
// narrowed by the filter.
const SEO_BLOCK = `<div class="seo-links">
  <h5 class="seo-links__header seo-links__header--thin">Популярные новостройки в Алматы</h5>
  <div class="seo-links__list seo-links__list--with-margin seo-links__complex_list"><ul class="seo-links__sublist">
    <li class="seo-links__item"><a data-complex-id="21784895" class="js-seo-search-list__complex-link" href="/complex/show/almaty/diamond/"> ЖК Diamond </a></li>
    <li class="seo-links__item"><a data-complex-id="12521845" class="js-seo-search-list__complex-link" href="/complex/show/almaty/estet/"> ЖК Estet </a></li>
    <li class="seo-links__item"><a data-complex-id="22276249" class="js-seo-search-list__complex-link" href="/complex/show/almaty/dreamcityart/"> ЖК Dream City. Art </a></li>
  </ul></div>
</div>`;

function realCatalogTests() {
  const html = `<html><head><title>Продажа 🏘 квартир в строящемся доме в Алматы - Крыша</title></head>
  <body class="complex-search"><main class="container">
    <h1>Квартиры в строящемся доме в Алматы</h1>
    <div class="complex-cards complex-cards--search">
      <div class="complex-card complex-card--not-empty complex-card--with-result" data-complex-id="22276249"
           data-complex-alias="almaty/dreamcityart" data-complex-region="Алматы" data-name="Dream City. Art">
        <div class="complex-card__state"> Строящийся </div>
        <a href="/complex/show/almaty/dreamcityart/" target="_blank" data-complex-id="22276249" class="complex-card__main-block">
          <div class="complex-card__header"><picture>
            <img src="https://krisha-photos.kcdn.online/04/d250/photo-750x470.jpg" alt="Dream City. Art" loading="lazy">
          </picture></div>
          <div class="complex-card__content">
            <span class="credit-badge credit-badge--hypothec"> Ипотека </span>
            <div class="complex-card__price-wrapper">
              <p class="complex-card__square-price"> от 690 000 ₸ за м² </p>
              <button class="complex-card__favorite-btn" type="button" data-id="22276249"></button>
            </div>
            <p class="complex-card__title"> ЖК Dream City. Art </p>
            <p class="complex-card__address"> Алматы, Медеуский р-н, ул. ​Приканальная БАК, 99а </p>
            <p class="complex-card__layout-nb"> 3 квартиры </p>
            <div class="complex-card__price-item"><span>1-комн. 38.01 м²</span><span>37.6 – 37.6 млн ₸</span></div>
          </div>
        </a>
        <div class="complex-card__phone"><button class="complex-card__order-call" data-name="Dream City. Art" data-id="22276249"> Заказать обратный звонок </button></div>
      </div>
      <div class="complex-card " data-complex-id="19798742" data-complex-alias="almaty/arenacitysport" data-complex-region="Алматы">
        <div class="complex-card__state"> Строящийся </div>
        <a href="/complex/show/almaty/arenacitysport/" target="_blank" data-complex-id="19798742" class="complex-card__main-block ">
          <p class="complex-card__square-price"> Нет данных </p>
          <p class="complex-card__title"> Бигвилль Arena City. Sport </p>
          <p class="complex-card__address"> Алматы, просп. Рыскулова / ул. Онгарсыновой </p>
        </a>
      </div>
    </div>
    <nav class="paginator">
      <a class="paginator__btn paginator__btn--prev" href="/complex/search/almaty/?state[]=1" data-page="1"><div class="paginator__btn-text">Предыдущая</div></a>
      <a class="paginator__btn " href="/complex/search/almaty/?state[]=1" data-page="1"> 1 </a>
      <a class="paginator__btn paginator__btn--active" href="/complex/search/almaty/?state[]=1&amp;page=2" data-page="2"> 2 </a>
      <a class="paginator__btn " href="/complex/search/almaty/?state[]=1&amp;page=3" data-page="3"> 3 </a>
      <span class="paginator__btn">...</span>
      <a class="paginator__btn " href="/complex/search/almaty/?state[]=1&amp;page=52" data-page="52"> 52 </a>
      <a class="paginator__btn paginator__btn--next" href="/complex/search/almaty/?state[]=1&amp;page=3" data-page="3"><div class="paginator__btn-text">Дальше</div></a>
    </nav>
  </main>
  ${SEO_BLOCK}
  <footer><a href="https://m.krisha.kz/complex/search/almaty/?state%5B%5D=1&page=2">Мобильная версия</a></footer>
  </body></html>`;

  const page = parseCatalogPage(html, 2, NOW);
  assert.deepEqual(
    page.cards.map((c) => c.krishaComplexId),
    ["22276249", "19798742"],
    "SEO links are not search results",
  );
  assert.equal(page.cardElements, 2);
  assert.equal(page.hasNextPage, true);
  assert.equal(page.lastPage, 52);
  assert.match(page.heading, /строящ/i);

  const [art, sport] = page.cards;
  assert.equal(art.name, "Dream City. Art");
  assert.equal(art.krishaUrl, "https://krisha.kz/complex/show/almaty/dreamcityart/");
  assert.equal(art.photoUrl, "https://krisha-photos.kcdn.online/04/d250/photo-750x470.jpg");
  assert.equal(art.priceText, "от 690 000 ₸ за м²");
  assert.equal(art.state, "Строящийся");
  assert.equal(art.status, "under_construction");
  assert.equal(art.address, "Алматы, Медеуский р-н, ул. Приканальная БАК, 99а", "zero-width space dropped");
  assert.equal(art.district, "Медеуский р-н");
  assert.equal(art.completion, null, "«3 квартиры», prices and areas are not a deadline");

  assert.equal(sport.name, "Arena City. Sport", "no data-name/alt: title minus its «Бигвилль» prefix");
  assert.equal(sport.priceText, "Нет данных");
  assert.equal(sport.photoUrl, null);
  assert.equal(sport.district, null);
  assert.equal(sport.status, "under_construction");

  const lastPage = parseCatalogPage(html.replace(/data-page="3"/g, 'data-page="1"').replace(/data-page="52"/g, 'data-page="2"'), 2, NOW);
  assert.equal(lastPage.hasNextPage, false, "no paginator link past this page");
  assert.equal(lastPage.lastPage, 2);

  // Past the end Krisha renders an empty result list — the SEO block alone
  // must not pass for a catalog page.
  const empty = parseCatalogPage(`<html><body><h1>Квартиры в строящемся доме</h1>${SEO_BLOCK}</body></html>`, 53, NOW);
  assert.equal(empty.cardElements, 0);
  assert.equal(empty.cards.length, 0);
  assert.equal(empty.lastPage, null);
}

function detailTests() {
  // Shape 1: <dl> label/value pairs, multi-phase deadline, developer with
  // link noise, embedded coordinates, apartment cards with floors + year.
  const dl = `<html><body>
    <script>window.data = {"complex":{"map":{"lat": 43.2121, "lon": 76.8513}}}</script>
    <div class="complex-info__address">Алматы, Алатауский р-н, мкр. Шугыла</div>
    <dl class="params">
      <dt>Застройщик</dt><dd><a href="/zastroyshik/bazisa/">BAZIS–А</a> Все ЖК застройщика</dd>
      <dt>Класс жилья</dt><dd>Комфорт</dd>
      <dt>Этажность</dt><dd>9–12</dd>
      <dt>Срок сдачи</dt><dd>1 очередь — IV квартал 2026 г.<br>2 очередь — III квартал 2027 г.</dd>
    </dl>
    <div class="a-card">2-комнатная квартира · 4/12 этаж · NEOPARK, монолитный дом, 2027 г.п.</div>
    <footer><a href="/complex/search/almaty/?year=2030">Срок сдачи в 2030 году</a></footer>
  </body></html>`;
  const d1 = parseComplexDetail(dl, NOW);
  assert.equal(d1.lat, 43.2121);
  assert.equal(d1.lng, 76.8513);
  assert.equal(d1.district, "Алатауский р-н");
  assert.equal(d1.developer, "BAZIS–А");
  assert.equal(d1.housingClass, "comfort");
  assert.deepEqual(d1.completion, { year: 2027, quarter: 3 });
  assert.equal(d1.floorsMax, 12, "apartment cards win over the label");
  assert.equal(d1.yearBuilt, 2027);

  // Shape 2: label/value spans in rows, value wrapped one level deeper,
  // status badge row, no apartment cards (off-plan) → floors from label.
  const rows = `<html><body>
    <div class="complex-params">
      <div class="complex-params__item"><div class="complex-params__head"><span>Статус</span></div><div class="complex-params__value">Строящийся</div></div>
      <div class="complex-params__item"><span class="label">Срок сдачи</span><span class="value">I квартал 2027 г.</span></div>
      <div class="complex-params__item"><span class="label">Класс</span><span class="value">бизнес</span></div>
      <div class="complex-params__item"><span class="label">Количество этажей</span><span class="value">от 6 до 16</span></div>
      <div class="complex-params__item"><span class="label">Застройщик</span><span class="value">Everest Development</span></div>
    </div>
    <nav><span>Срок сдачи</span><a href="/x">2031</a></nav>
  </body></html>`;
  const d2 = parseComplexDetail(rows, NOW);
  assert.equal(d2.status, "under_construction");
  assert.deepEqual(d2.completion, { year: 2027, quarter: 1 });
  assert.equal(d2.housingClass, "business");
  assert.equal(d2.floorsMax, 16);
  assert.equal(d2.developer, "Everest Development");
  assert.equal(d2.lat, null);

  // Shape 3: inline «Label: value» in one element, and a <b> label with a
  // bare text value; bare-year deadline.
  const inline = `<html><body>
    <ul>
      <li><b>Срок сдачи:</b> 2027 г.</li>
      <li>Застройщик: ТОО «Vertex AG» Показать телефон</li>
      <li>Класс жилья — эконом</li>
    </ul>
  </body></html>`;
  const d3 = parseComplexDetail(inline, NOW);
  assert.deepEqual(d3.completion, { year: 2027, quarter: null });
  assert.equal(d3.developer, "ТОО «Vertex AG»");
  assert.equal(d3.housingClass, "economy");

  // Shape 4: «Срок сдачи III кв. 2026» in a single text node, no colon.
  const tight = `<html><body><div class="complex-header__deadline">Срок сдачи III кв. 2026</div>
    <p>Срок сдачи объекта неоднократно переносился, по словам жителей, на 2029 год</p></body></html>`;
  const d4 = parseComplexDetail(tight, NOW);
  assert.deepEqual(d4.completion, { year: 2026, quarter: 3 }, "sentences starting with the label are ignored");

  // Nothing to find: no false positives from navigation-only pages.
  const empty = parseComplexDetail(`<html><body><nav><a>Застройщикам</a></nav><p>Классы квартир</p></body></html>`, NOW);
  assert.equal(empty.developer, null);
  assert.equal(empty.completion, null);
  assert.equal(empty.housingClass, null);
  assert.equal(empty.status, null);
}

function main() {
  completionTests();
  statusAndClassTests();
  catalogTests();
  realCatalogTests();
  detailTests();
  console.log("Krisha ЖК HTML parser tests passed");
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
