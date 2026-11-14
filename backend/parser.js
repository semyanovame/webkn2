const { chromium } = require('playwright');
const cheerio = require('cheerio');

const BASE = 'https://novosibirsk.etagi.com';

async function parseEtagi() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // 🕵️ ПЕРЕХВАТ СЕТЕВЫХ ЗАПРОСОВ
  let interceptedData = null;
  page.on('response', async response => {
    try {
      // Ищем ответы, которые могут содержать данные об объектах
      if (response.url().includes('api') || response.url().includes('graphql') || response.url().includes('objects')) {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          console.log('\n🎯 ПЕРЕХВАЧЕН JSON-ОТВЕТ ОТ:', response.url());
          console.log('Ключи ответа:', Object.keys(json));
          // Если найдем что-то похожее на массив объектов, сохраним для анализа
          if (json.data || json.objects || json.items) {
            interceptedData = json;
          }
        }
      }
    } catch (e) {
      // Игнорируем ошибки парсинга не-JSON ответов
    }
  });

  try {
    await page.goto(`${BASE}/realty_rent/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('[data-testid="object_card"]', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const $ = cheerio.load(await page.content());
    const listings = [];

    $('[data-testid="object_card"]').each((index, el) => {
      const $card = $(el);
      const text = $card.text().replace(/\s+/g, ' ').trim();

      // 🔍 АБСОЛЮТНАЯ ДИАГНОСТИКА ПЕРВОЙ КАРТОЧКИ
      if (index === 0) {
        console.log('\n=== ПОЛНЫЙ ТЕКСТ ПЕРВОЙ КАРТОЧКИ (БЕЗ ФИЛЬТРОВ) ===');
        console.log(text);
        console.log('\n=== ВСЕ ССЫЛКИ (HREF) В КАРТОЧКЕ ===');
        $card.find('a').each((_, a) => console.log($(a).attr('href')));
        console.log('====================================================\n');
      }

      // --- СТАНДАРТНЫЙ ПАРСИНГ ---
      const href = $card.find('a[href*="/realty_rent/"]').first().attr('href') || '';
      const id = (href.match(/\/(\d+)\/?$/) || [])[1] || crypto.randomUUID();

      const rawSrc = $card.find('img[data-testid="object_card_mediaslider"]').first().attr('src') || '';
      const photos = rawSrc ? [rawSrc.startsWith('//') ? 'https:' + rawSrc : rawSrc] : [];

      const priceRaw = $card.find('[data-testid="object_card_price"]').first().text();
      const price = parseInt((priceRaw.match(/\d[\d\s]*/) || ['0'])[0].replace(/\D/g, '')) || 0;

      const rooms = parseInt((text.match(/(\d+)\s*[-–]?\s*комн/i) || [])[1]) || 0;
      const area = parseFloat(((text.match(/(\d+(?:[.,]\d+)?)\s*м[²2]/i) || [])[1] || '').replace(',', '.')) || 0;
      const floor = ((text.match(/(\d+\/\d+)\s*эт/i) || [])[1]) || '';

      const addr = (text.match(/(?:ул\.|просп\.?|пр\.|шоссе|мкр\.?|б-р|пер\.)\s*[^,]{2,40}/i) || [])[0];
      const title = addr ? addr.trim() : 'Без названия';

      // Пока оставляем "Не указан", так как в DOM этого нет. 
      // Если в консоли выше мы увидим район в тексте или href, мы добавим его сюда.
      let district = 'Не указан';
      const nskDistricts = ['Калининский', 'Первомайский', 'Центральный', 'Ленинский', 'Железнодорожный', 'Кировский', 'Советский', 'Дзержинский', 'Заельцовский', 'Октябрьский'];
      for (const dist of nskDistricts) {
        if (text.includes(dist)) {
          district = dist + ' район';
          break;
        }
      }

      if (price === 0 && photos.length === 0) return; 

      listings.push({ id, title, price, district, rooms, area, floor, description: 'Подробное описание доступно на странице объекта', photos, source: 'etagi', updatedAt: new Date().toISOString() });
    });

    console.log(`✅ Успешно спарсено ${listings.length} объявлений`);
    return listings;
  } catch (error) {
    console.error('❌ Ошибка при парсинге:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

module.exports = { parseEtagi };