const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { parseEtagi } = require('./parser');

const app = express();
app.use(cors());
app.use(express.json());

let cachedListings = [];

async function updateCache() {
  console.log('Обновление данных...');
  const newData = await parseEtagi();
  if (newData.length > 0) {
    cachedListings = newData;
    console.log(`Сохранено ${newData.length} объявлений`);
  }
}

updateCache();

cron.schedule('0 */6 * * *', updateCache);

app.get('/api/listings', (req, res) => {
  res.json(cachedListings);
});

app.post('/api/refresh', async (req, res) => {
  await updateCache();
  res.json({ message: 'Обновлено', count: cachedListings.length });
});

app.listen(3000, () => console.log('Сервер запущен на порту 3000'));