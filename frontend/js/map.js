/**
 * Mapa Leaflet - wizualizacja wszystkich miast z temperaturami
 */

let map = null;
let markersLayer = null;

/**
 * Formatuje datę do YYYY-MM-DD
 */
function mapFormatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Inicjalizuje mapę Leaflet
 */
function initializeMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    if (map) {
        map.remove();
    }

    map = L.map('map').setView([51.9, 21.5], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    if (markersLayer) {
        map.removeLayer(markersLayer);
    }
    markersLayer = L.layerGroup().addTo(map);
}

/**
 * Pobiera temperatury dla wszystkich miast w danym dniu
 */
async function getAllCityTemperatures(dateStr) {
    try {
        const response = await fetch(
            `${API_CONFIG.SUPABASE_URL}/rest/v1/weather_data?forecast_time=gte.${dateStr}T00:00:00Z&forecast_time=lte.${dateStr}T23:59:59Z&order=city_id.asc,forecast_time.asc&limit=10000`,
            {
                headers: {
                    'apikey': API_CONFIG.SUPABASE_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Błąd przy pobieraniu temperatur:', error);
        return [];
    }
}

/**
 * Wybiera 4 pomiary z równymi przedziałami czasowymi
 */
function selectMeasurements(records) {
    if (records.length === 0) return [];
    if (records.length <= 4) return records;

    const step = Math.floor(records.length / 4);
    return [
        records[0],
        records[step] || records[Math.floor(records.length / 3)],
        records[step * 2] || records[Math.floor(records.length / 2)],
        records[records.length - 1]
    ];
}

/**
 * Rysuje mini canvas z 4 temperaturami
 */
function createTemperatureCanvas(temperatures) {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 40;

    const ctx = canvas.getContext('2d');
    const padding = 5;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    const minTemp = Math.min(...temperatures);
    const maxTemp = Math.max(...temperatures);
    const tempRange = maxTemp - minTemp || 1;

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    temperatures.forEach((temp, idx) => {
        const x = padding + (idx / (temperatures.length - 1)) * chartWidth;
        const normalizedTemp = (temp - minTemp) / tempRange;
        const y = canvas.height - padding - normalizedTemp * chartHeight;

        if (idx === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    temperatures.forEach((temp, idx) => {
        const x = padding + (idx / (temperatures.length - 1)) * chartWidth;
        ctx.fillText(temp.toFixed(0) + '°', x, canvas.height - 2);
    });

    return canvas;
}

/**
 * Wyświetla mapę ze wszystkimi miastami
 */
async function displayMapWithCities(dateStr) {
    if (!map) return;

    // Usuń placeholder
    const mapContainer = document.getElementById('map');
    const placeholder = mapContainer.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    markersLayer.clearLayers();

    const cities = await getAvailableLocations();
    const allRecords = await getAllCityTemperatures(dateStr);

    // Grupuj dane po city_id
    const dataByCity = {};
    allRecords.forEach(record => {
        if (!dataByCity[record.city_id]) {
            dataByCity[record.city_id] = [];
        }
        dataByCity[record.city_id].push(record);
    });

    console.log(`Ładuję mapę dla ${cities.length} miast... (${allRecords.length} rekordów)`);

    for (const city of cities) {
        const records = dataByCity[city.id] || [];
        const temps = records.map(r => r.temperature_2m).filter(t => t !== null && t !== undefined);
        const selected = selectMeasurements(temps);
        const hasData = selected.length > 0;

        const marker = L.circleMarker(
            [city.latitude_real || city.latitude, city.longitude_real || city.longitude],
            {
                radius: 15,
                fillColor: hasData ? '#3b82f6' : '#d1d5db',
                color: hasData ? '#1e40af' : '#9ca3af',
                weight: 2,
                opacity: 0.8,
                fillOpacity: hasData ? 0.6 : 0.4
            }
        );

        let popupContent = `<div style="text-align: center; font-weight: bold; margin-bottom: 5px;">${city.name}</div>`;

        if (hasData) {
            const canvas = createTemperatureCanvas(selected);
            popupContent += `
                <div style="border: 1px solid #e5e7eb; padding: 5px; border-radius: 4px;">
                    ${canvas.outerHTML}
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">
                    ${selected.length} pomiarów
                </div>
            `;
        } else {
            popupContent += `<div style="font-size: 11px; color: #999;">Brak danych na tę datę</div>`;
        }

        marker.bindPopup(popupContent);

        // Klikanie na marker załaduje dane dla tego miasta
        marker.on('click', () => {
            loadCityData(city.id, city.name, dateStr);
        });

        marker.addTo(markersLayer);
    }

    console.log('✓ Mapa zaktualizowana');
}

/**
 * Załaduje dane dla wybranego miasta ze mapy
 */
async function loadCityData(cityId, cityName, dateStr) {
    try {
        console.log(`Załaduję dane dla ${cityName}...`);
        showLoading(true);
        showError('');

        // Ustaw wartość selectu
        const select = document.getElementById('location-select');
        if (select) {
            select.value = JSON.stringify({ city_id: cityId, name: cityName });
        }

        const startDate = new Date(dateStr);
        startDate.setDate(startDate.getDate() - 1);

        const weatherRecords = await getWeatherData(
            cityId,
            mapFormatDate(startDate),
            dateStr
        );

        const dailyStats = await getDailyStats(cityId, dateStr);

        processAndDisplayData(weatherRecords, dailyStats);
        console.log(`✓ Załadowano ${weatherRecords.length} rekordów`);
    } catch (error) {
        showError(`Błąd: ${error.message}`);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// Inicjalizuj mapę przy załadowaniu
document.addEventListener('DOMContentLoaded', async () => {
    initializeMap();

    // Załaduj mapę z dzisiejszą datą
    const today = new Date();
    const dateStr = mapFormatDate(today);
    await displayMapWithCities(dateStr);

    // Słuchaj zmian daty i aktualizuj mapę
    const datePicker = document.getElementById('date-picker');
    if (datePicker) {
        datePicker.addEventListener('change', (e) => {
            displayMapWithCities(e.target.value);
        });
    }
});
