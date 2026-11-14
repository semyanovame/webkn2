<template>
  <div class="app">
    <header>
      <h1>🏠 Аренда жилья в Новосибирске</h1>
      <button @click="refreshData" :disabled="isLoading" class="btn-refresh">
        {{ isLoading ? 'Обновляем...' : '🔄 Обновить данные' }}
      </button>
    </header>

    <!-- Панель фильтров -->
    <div class="filters">
      <input v-model="search" placeholder="🔍 Поиск по адресу..." class="input" />
      
      <select v-model="filterRooms" class="input">
        <option value="">Любое кол-во комнат</option>
        <option value="1">1 комната</option>
        <option value="2">2 комнаты</option>
        <option value="3">3+ комнаты</option>
      </select>

      <select v-model="filterDistrict" class="input">
        <option value="">Любой район</option>
        <option v-for="dist in uniqueDistricts" :key="dist" :value="dist">{{ dist }}</option>
      </select>

      <div class="price-filter">
        <label>До {{ filterPrice.toLocaleString() }} ₽</label>
        <input type="range" v-model.number="filterPrice" :max="maxPrice" step="1000" />
      </div>

      <button @click="showFavoritesOnly = !showFavoritesOnly" class="btn-fav-toggle">
        {{ showFavoritesOnly ? 'Показать все' : '❤️ Избранное' }}
      </button>
    </div>

    <!-- Счётчик -->
    <p class="count">Найдено объявлений: <strong>{{ filteredListings.length }}</strong></p>

    <!-- Сообщение, если ничего не найдено -->
    <div v-if="filteredListings.length === 0" class="no-results">
      😔 По выбранным условиям объявления не найдены. Попробуйте смягчить фильтры.
    </div>

    <!-- Сетка карточек -->
    <div class="grid">
      <div v-for="item in filteredListings" :key="item.id" class="card" @click="openDetail(item)">
        <img :src="item.photos?.[0] || 'https://via.placeholder.com/300x200?text=Нет+фото'" alt="Фото" />
        <div class="card-body">
          <h3>{{ item.title || 'Адрес не указан' }}</h3>
          <p class="price">{{ item.price?.toLocaleString() || '0' }} ₽/мес</p>
          <p class="meta">
            {{ item.rooms ? item.rooms + '-комн.' : 'Студия' }} | 
            {{ item.area || '?' }} м² | 
            {{ item.floor ? item.floor + ' эт.' : '' }}
          </p>
          <button @click.stop="toggleFavorite(item.id)" class="btn-card-fav">
            {{ isFavorite(item.id) ? '💔 Убрать' : '🤍 В избранное' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Модальное окно с деталями -->
    <div v-if="selectedItem" class="modal-overlay" @click.self="selectedItem = null">
      <div class="modal">
        <button @click="selectedItem = null" class="btn-close">✕</button>
        <h2>{{ selectedItem.title }}</h2>
        
        <div class="gallery">
          <img v-for="(photo, idx) in selectedItem.photos" :key="idx" :src="photo" />
        </div>
        
        <div class="details">
          <p><strong>💰 Цена:</strong> {{ selectedItem.price?.toLocaleString() }} ₽/мес</p>
          <p><strong>📍 Район:</strong> {{ selectedItem.district }}</p>
          <p><strong>📐 Площадь:</strong> {{ selectedItem.area }} м² ({{ selectedItem.floor }} этаж)</p>
          <p><strong>📝 Описание:</strong> {{ selectedItem.description || 'Описание отсутствует' }}</p>
          <a :href="'https://novosibirsk.etagi.com/realty_rent/' + selectedItem.id + '/'" target="_blank" class="btn-link">
            Открыть на сайте Этажей ↗
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const listings = ref([]);
const search = ref('');
const filterPrice = ref(100000);
const filterRooms = ref('');
const filterDistrict = ref('');
const showFavoritesOnly = ref(false);
const selectedItem = ref(null);
const isLoading = ref(false);

// Избранное сохраняется в браузере, чтобы не пропадать при обновлении страницы
const favorites = ref(JSON.parse(localStorage.getItem('etagi_favorites') || '[]'));

const fetchData = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/listings');
    listings.value = await res.json();
    // Автоматически ставим макс. цену чуть выше самой дорогой квартиры для ползунка
    if (listings.value.length > 0) {
      maxPrice.value = Math.ceil(Math.max(...listings.value.map(i => i.price)) / 10000) * 10000;
      filterPrice.value = maxPrice.value;
    }
  } catch (e) {
    console.error('Ошибка загрузки данных:', e);
  }
};

const refreshData = async () => {
  isLoading.value = true;
  try {
    await fetch('http://localhost:3000/api/refresh', { method: 'POST' });
    await fetchData();
  } finally {
    isLoading.value = false;
  }
};

const maxPrice = ref(100000);

// Собираем уникальные районы из полученных данных
const novosibirskDistricts = [
  'Центральный район',
  'Заельцовский район',
  'Советский район',
  'Калининский район',
  'Дзержинский район',
  'Октябрьский район',
  'Ленинский район',
  'Кировский район',
  'Железнодорожный район',
  'Первомайский район',
  'Не указан'
];
const uniqueDistricts = computed(() => {
  const availableDistricts = new Set(listings.value.map(item => item.district));
  // Возвращаем только те районы из полного списка, которые присутствуют в спаршенных данных
  return novosibirskDistricts.filter(dist => availableDistricts.has(dist));
});

// Главная реактивная фильтрация
const filteredListings = computed(() => {
  return listings.value.filter(item => {
    if (showFavoritesOnly.value && !favorites.value.includes(item.id)) return false;
    if (search.value && !item.title?.toLowerCase().includes(search.value.toLowerCase())) return false;
    if (item.price > filterPrice.value) return false;
    
    if (filterRooms.value === '3' && item.rooms < 3) return false;
    if (filterRooms.value && filterRooms.value !== '3' && item.rooms !== Number(filterRooms.value)) return false;
    
    if (filterDistrict.value && item.district !== filterDistrict.value) return false;
    
    return true;
  });
});

const isFavorite = (id) => favorites.value.includes(id);

const toggleFavorite = (id) => {
  if (isFavorite(id)) {
    favorites.value = favorites.value.filter(favId => favId !== id);
  } else {
    favorites.value.push(id);
  }
  localStorage.setItem('etagi_favorites', JSON.stringify(favorites.value));
};

const openDetail = (item) => {
  selectedItem.value = item;
};

onMounted(fetchData);
</script>

<style scoped>
.app { max-width: 1200px; margin: 0 auto; padding: 20px; font-family: 'Segoe UI', sans-serif; color: #333; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.filters { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; }
.input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
.price-filter { display: flex; flex-direction: column; justify-content: center; min-width: 150px; }
.btn-refresh, .btn-fav-toggle { padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
.btn-refresh:disabled { background: #ccc; cursor: not-allowed; }
.count { font-size: 1.1em; color: #555; margin-bottom: 15px; }
.no-results { text-align: center; color: #666; font-size: 1.2em; margin-top: 40px; padding: 30px; background: #f9f9f9; border-radius: 8px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
.card { border: 1px solid #eee; border-radius: 10px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: white; }
.card:hover { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
.card img { width: 100%; height: 180px; object-fit: cover; }
.card-body { padding: 15px; }
.card h3 { font-size: 1.05em; margin: 0 0 8px; color: #222; }
.card .price { font-weight: bold; color: #2ecc71; font-size: 1.3em; margin: 0 0 8px; }
.card .meta { color: #666; font-size: 0.9em; margin: 0 0 12px; }
.btn-card-fav { width: 100%; padding: 10px; background: #f8f9fa; border: 1px solid #eee; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
.btn-card-fav:hover { background: #e2e6ea; }

/* Модальное окно */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(3px); }
.modal { background: white; padding: 25px; border-radius: 12px; max-width: 700px; width: 90%; max-height: 90vh; overflow-y: auto; position: relative; }
.btn-close { position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 1.8em; cursor: pointer; color: #666; }
.gallery { display: flex; gap: 10px; overflow-x: auto; margin: 15px 0; padding-bottom: 10px; }
.gallery img { height: 150px; border-radius: 6px; flex-shrink: 0; }
.details p { margin: 10px 0; line-height: 1.5; font-size: 1.05em; }
.btn-link { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #2ecc71; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
.btn-link:hover { background: #27ae60; }
</style>