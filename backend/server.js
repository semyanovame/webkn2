const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { parseEtagi } = require('./parser'); // Подключаем ваш файл parser.js

const app = express();
app.use(cors()); // Разрешаем запросы от Vue-приложения
app.use(express.json());

let cachedListings = []; // Хранилище данных в памяти

async function updateCache() {
  console.log('🔄 Обновление данных...');
  const newData = await parseEtagi();
  if (newData.length > 0) {
    cachedListings = newData;
    console.log(`💾 Сохранено ${newData.length} объявлений`);
  }
}

// Запускаем обновление при старте сервера
updateCache();

// Автообновление каждые 6 часов
cron.schedule('0 */6 * * *', updateCache);

// API для получения списка
app.get('/api/listings', (req, res) => {
  res.json(cachedListings);
});

// API для ручного обновления (кнопка во Vue)
app.post('/api/refresh', async (req, res) => {
  await updateCache();
  res.json({ message: 'Обновлено', count: cachedListings.length });
});

app.listen(3000, () => console.log('🚀 Сервер запущен на порту 3000'));