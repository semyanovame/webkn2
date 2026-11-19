const { chromium } = require('playwright');
const cheerio = require('cheerio');

const BASE = 'https://novosibirsk.etagi.com';

function cleanDescription(raw) {
  let text = raw.replace(/\s+/g, ' ').trim();

  // Отрезаем мусор в начале: "Описание", "Изменено: ...", "N просмотров"
  const viewMatch = text.match(/просмотр\w*\s*/i);
  if (viewMatch && viewMatch.index < 100) {
    text = text.slice(viewMatch.index + viewMatch[0].length);
  } else {
    text = text.replace(/^Описание\s*/i, '');
  }

  // Отрезаем мусор в конце: "Показать больше/меньше", "Скрыть"
  text = text.replace(/\s*(?:Показать\s*(?:больше|меньше)|Скрыть)\s*$/i, '');

  return text.trim();
}

async function parseEtagi() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    console.log('📋 Шаг 1: Парсинг списка карточек...');
    await page.goto(`${BASE}/realty_rent/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('[data-testid="object_card"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const $ = cheerio.load(await page.content());
    const listings = [];

    $('[data-testid="object_card"]').each((_, el) => {
      const $card = $(el);
      const text = $card.text().replace(/\s+/g, ' ').trim();

      const href = $card.find('a[href*="/realty_rent/"]').first().attr('href') || '';
      const id = (href.match(/\/(\d+)\/?$/) || [])[1] || null;
      if (!id) return;

      const rawSrc = $card.find('img[data-testid="object_card_mediaslider"]').first().attr('src') || '';
      const photos = rawSrc ? [rawSrc.startsWith('//') ? 'https:' + rawSrc : rawSrc] : [];

      const priceRaw = $card.find('[data-testid="object_card_price"]').first().text();
      const price = parseInt((priceRaw.match(/\d[\d\s]*/) || ['0'])[0].replace(/\D/g, '')) || 0;

      const rooms = parseInt((text.match(/(\d+)\s*[-–]?\s*комн/i) || [])[1]) || 0;

      const areaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*м[²2]/i);
      const area = areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : 0;

      let floor = '';
      $card.find('span').each((_, span) => {
        const spanText = $(span).text().trim();
        const floorMatch = spanText.match(/(\d+\/\d+)\s*эт/);
        if (floorMatch) { floor = floorMatch[1]; return false; }
      });

      let title = 'Без названия';
      const addrMatch = text.match(/(?:ул\.|просп\.?|пр\.|пр-кт|шоссе|мкр\.?|б-р|пер\.|наб\.|пл\.|туп\.|проезд)\s*[^,]{2,40}/i);
      if (addrMatch) title = addrMatch[0].trim();
      if (title === 'Без названия') {
        const novoMatch = text.match(/Новосибирск[,\s]+([^,]{5,50})/i);
        if (novoMatch) title = novoMatch[1].trim();
      }

      if (price === 0 && photos.length === 0) return;

      listings.push({ id, title, price, district: 'Не указан', rooms, area, floor, photos, description: '' });
    });

    console.log(`📋 Найдено ${listings.length} карточек. Загружаем описания и районы...`);

    // ШАГ 2: Страница объекта → описание + район
    for (let i = 0; i < listings.length; i++) {
      const item = listings[i];
      try {
        await page.goto(`${BASE}/realty_rent/${item.id}/`, { 
          waitUntil: 'domcontentloaded', 
          timeout: 15000 
        });
        await page.waitForTimeout(1500);

        const page$ = cheerio.load(await page.content());
        let description = '';

        description = page$('[data-testid="object_description"], [data-testid="description"]').first().text().trim();
        if (!description) {
          description = page$('.ObjectCard__description, .description, .about-object, [class*="description"], [class*="about"]').first().text().trim();
        }
        if (!description) {
          const headings = page$('h2, h3, h4');
          for (const h of headings) {
            const hText = page$(h).text().trim().toLowerCase();
            if (hText.includes('описан') || hText.includes('об объект') || hText.includes('о квартире')) {
              let next = page$(h).next();
              while (next.length && next.text().trim().length < 20) next = next.next();
              if (next.length) description = next.text().trim();
              break;
            }
          }
        }
        if (!description) {
          const paragraphs = page$('p').map((_, el) => page$(el).text().trim()).get();
          const longText = paragraphs.find(t => t.length > 100);
          if (longText) description = longText;
        }

        item.description = cleanDescription(description);
        if (item.description.length > 2000) item.description = item.description.slice(0, 2000) + '...';

        // 🎯 Район извлекаем из описания (там он реально есть!)
        const distMatch = item.description.match(/([А-ЯЁ][а-яё]+(?:\s[А-ЯЁ][а-яё]+)?)\s+район/i);
        if (distMatch) item.district = distMatch[1].trim() + ' район';

        console.log(`  ✅ [${i + 1}/${listings.length}] ${item.district} | ${item.description.slice(0, 50)}...`);
      } catch (e) {
        console.log(`  ⚠️ [${i + 1}/${listings.length}] ${item.id}: ${e.message.slice(0, 50)}`);
        item.description = 'Не удалось загрузить описание';
      }
    }

    console.log(`✅ Готово. Спарсено ${listings.length} объявлений`);
    return listings;
  } catch (error) {
    console.error('❌ Ошибка при парсинге:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

module.exports = { parseEtagi };