/**
 * Główna logika aplikacji - obsługa UI i interakcji
 */

let currentLocation = null;
let currentData = null;

// === INICJALIZACJA ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🌤️ Inicjalizacja aplikacji...');

    // Ustaw dzisiaj jako domyślną datę
    const today = new Date();
    document.getElementById('date-picker').valueAsDate = today;

    // Załaduj dostępne lokalizacje
    await loadLocations();

    // Obsługuj klik na przycisk
    document.getElementById('load-data-btn').addEventListener('click', loadWeatherData);
});

/**
 * Załaduj listę dostępnych lokalizacji
 */
async function loadLocations() {
    try {
        showLoading(true);

        const locations = await getAvailableLocations();
        const select = document.getElementById('location-select');

        // Wyczyść opcje
        select.innerHTML = '<option value="">-- Załaduj dostępne lokalizacje --</option>';

        if (locations.length === 0) {
            showError('Brak dostępnych lokalizacji. Upewnij się, że dane są w bazie Supabase.');
            return;
        }

        // Dodaj opcje
        const uniqueLocations = [];
        const seenKeys = new Set();

        locations.forEach(loc => {
            const key = `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;
            if (!seenKeys.has(key)) {
                uniqueLocations.push(loc);
                seenKeys.add(key);
            }
        });

        uniqueLocations.forEach(loc => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ lat: loc.latitude, lon: loc.longitude });
            option.textContent = loc.location_name || `${loc.latitude.toFixed(2)}°N, ${loc.longitude.toFixed(2)}°E`;
            select.appendChild(option);
        });

        console.log(`✓ Załadowano ${uniqueLocations.length} lokalizacji`);
    } catch (error) {
        showError(`Błąd przy ładowaniu lokalizacji: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Załaduj dane pogodowe dla wybranej lokalizacji
 */
async function loadWeatherData() {
    try {
        const locationJson = document.getElementById('location-select').value;
        const dateStr = document.getElementById('date-picker').value;

        // Walidacja
        if (!locationJson) {
            showError('Wybierz lokalizację');
            return;
        }
        if (!dateStr) {
            showError('Wybierz datę');
            return;
        }

        showLoading(true);
        showError('');

        const location = JSON.parse(locationJson);
        currentLocation = location;

        // Pobierz dane surowe (24h)
        const endDate = new Date(dateStr);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 1);

        const weatherRecords = await getWeatherData(
            location.lat,
            location.lon,
            formatDate(startDate),
            formatDate(endDate)
        );

        // Pobierz statystyki dzienne
        const dailyStats = await getDailyStats(location.lat, location.lon, dateStr);

        // Przetwórz dane
        processAndDisplayData(weatherRecords, dailyStats);

        console.log(`✓ Załadowano ${weatherRecords.length} rekordów`);
    } catch (error) {
        showError(`Błąd przy ładowaniu danych: ${error.message}`);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

/**
 * Przetwarza i wyświetla dane na stronie
 */
function processAndDisplayData(records, dailyStats) {
    if (!records || records.length === 0) {
        showError('Brak danych dla wybranej daty i lokalizacji');
        return;
    }

    // Jeśli są statystyki dzienne, używaj ich; inaczej oblicz z rekordów surowych
    if (dailyStats) {
        displayStats(dailyStats);
    } else {
        const stats = calculateStatsFromRecords(records);
        displayStats(stats);
    }

    // Wykresy
    const temperatures = records.map(r => r.temperature_2m).filter(v => v !== null && v !== undefined);
    const precipitations = records.map(r => r.precipitation_6h).filter(v => v !== null && v !== undefined);
    const windSpeeds = records.map(r => r.wind_speed_10m).filter(v => v !== null && v !== undefined);
    const windDirs = records.map(r => r.wind_direction_10m).filter(v => v !== null && v !== undefined);
    const cloudCovers = records.map(r => r.cloud_cover_total).filter(v => v !== null && v !== undefined);

    drawTemperatureChart('temp-chart', temperatures);
    drawPrecipitationChart('precip-chart', precipitations);
    drawWindChart('wind-chart', windSpeeds, windDirs);
    const avgCloud = cloudCovers.length > 0 ? cloudCovers.reduce((a, b) => a + b) / cloudCovers.length : 0;
    drawCloudChart('cloud-chart', avgCloud);

    currentData = records;
}

/**
 * Oblicza statystyki z rekordów surowych (gdy brak daily_stats)
 */
function calculateStatsFromRecords(records) {
    const temps = records.map(r => r.temperature_2m).filter(v => v !== null && v !== undefined);
    const precipitations = records.map(r => r.precipitation_6h).filter(v => v !== null && v !== undefined);
    const windSpeeds = records.map(r => r.wind_speed_10m).filter(v => v !== null && v !== undefined);
    const windDirs = records.map(r => r.wind_direction_10m).filter(v => v !== null && v !== undefined);
    const clouds = records.map(r => r.cloud_cover_total).filter(v => v !== null && v !== undefined);

    return {
        temp_min: temps.length > 0 ? Math.min(...temps) : null,
        temp_max: temps.length > 0 ? Math.max(...temps) : null,
        temp_avg: temps.length > 0 ? temps.reduce((a, b) => a + b) / temps.length : null,
        precipitation_sum: precipitations.reduce((a, b) => a + b, 0),
        wind_speed_avg: windSpeeds.length > 0 ? windSpeeds.reduce((a, b) => a + b) / windSpeeds.length : null,
        wind_speed_max: windSpeeds.length > 0 ? Math.max(...windSpeeds) : null,
        wind_direction_dominant: windDirs.length > 0 ? calculateMeanDirection(windDirs) : null,
        cloud_cover_avg: clouds.length > 0 ? clouds.reduce((a, b) => a + b) / clouds.length : null,
    };
}

/**
 * Oblicza średni kierunek wiatru (statystyka kierunkowa)
 */
function calculateMeanDirection(directions) {
    if (!directions.length) return 0;

    const radians = directions.map(d => d * Math.PI / 180);
    const sinSum = radians.reduce((sum, r) => sum + Math.sin(r), 0);
    const cosSum = radians.reduce((sum, r) => sum + Math.cos(r), 0);

    const meanRad = Math.atan2(sinSum, cosSum);
    const meanDeg = meanRad * 180 / Math.PI;

    return (meanDeg + 360) % 360;
}

/**
 * Wyświetla statystyki na stronie
 */
function displayStats(stats) {
    document.getElementById('temp-min').textContent = stats.temp_min ? stats.temp_min.toFixed(1) : '--';
    document.getElementById('temp-max').textContent = stats.temp_max ? stats.temp_max.toFixed(1) : '--';
    document.getElementById('temp-avg').textContent = stats.temp_avg ? stats.temp_avg.toFixed(1) : '--';

    document.getElementById('precip-sum').textContent = stats.precipitation_sum ? stats.precipitation_sum.toFixed(1) : '--';

    document.getElementById('wind-avg').textContent = stats.wind_speed_avg ? stats.wind_speed_avg.toFixed(1) : '--';
    document.getElementById('wind-max').textContent = stats.wind_speed_max ? stats.wind_speed_max.toFixed(1) : '--';
    document.getElementById('wind-dir').textContent = stats.wind_direction_dominant ? stats.wind_direction_dominant.toFixed(0) : '--';

    document.getElementById('cloud-avg').textContent = stats.cloud_cover_avg ? stats.cloud_cover_avg.toFixed(0) : '--';
}

/**
 * Pokazuje/ukrywa loading
 */
function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (show) {
        loadingEl.classList.remove('hidden');
    } else {
        loadingEl.classList.add('hidden');
    }
}

/**
 * Pokazuje komunikat błędu
 */
function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.classList.add('hidden');
    }
}
