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

// === TAB SWITCHING ===
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
        });

        document.getElementById(tabId).classList.add('active');
        btn.classList.add('active');
    });
});

// === INICJALIZACJA LOKALIZACJI ===
async function initializeLocationSelects() {
    const locations = await getAvailableLocations();
    const uniqueLocations = [];
    const seenKeys = new Set();

    locations.forEach(loc => {
        const key = `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;
        if (!seenKeys.has(key)) {
            uniqueLocations.push(loc);
            seenKeys.add(key);
        }
    });

    [document.getElementById('raw-location-select'), document.getElementById('daily-location-select')].forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">-- Wybierz --</option>';
            uniqueLocations.forEach(loc => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({lat: loc.latitude, lon: loc.longitude});
                opt.textContent = loc.location_name;
                select.appendChild(opt);
            });
        }
    });
}

// === TAB 2: DANE SUROWE ===
document.getElementById('load-raw-data-btn')?.addEventListener('click', loadRawData);

async function loadRawData() {
    try {
        const locJson = document.getElementById('raw-location-select').value;
        const dateFrom = document.getElementById('raw-date-from').value;
        const dateTo = document.getElementById('raw-date-to').value;

        if (!locJson || !dateFrom || !dateTo) {
            showError('Wybierz wszystkie pola');
            return;
        }

        showLoading(true);
        showError('');

        const loc = JSON.parse(locJson);
        const response = await fetch(
            `${API_CONFIG.SUPABASE_URL}/rest/v1/weather_data?latitude=eq.${loc.lat.toFixed(2)}&longitude=eq.${loc.lon.toFixed(2)}&forecast_time=gte.${dateFrom}T00:00:00Z&forecast_time=lte.${dateTo}T23:59:59Z&limit=10000`,
            {headers: {'apikey': API_CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json'}}
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const records = await response.json();
        displayRawDataTable(records);
    } catch (error) {
        showError(`Błąd: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function displayRawDataTable(records) {
    const container = document.getElementById('raw-data-table');
    if (!records || records.length === 0) {
        container.innerHTML = '<p class="placeholder">Brak danych</p>';
        return;
    }

    let html = `<table><thead><tr><th>Data</th><th>Godzina</th><th>Temp (°C)</th><th>Wiatr (m/s)</th><th>Kierunek (°)</th><th>Opady (mm)</th><th>Chmury (%)</th></tr></thead><tbody>`;
    records.forEach(r => {
        const date = new Date(r.forecast_time);
        html += `<tr><td>${date.toLocaleDateString('pl-PL')}</td><td>${String(date.getHours()).padStart(2, '0')}:00</td><td>${(r.temperature_2m || 0).toFixed(1)}</td><td>${(r.wind_speed_10m || 0).toFixed(1)}</td><td>${(r.wind_direction_10m || 0).toFixed(0)}</td><td>${(r.precipitation_6h || 0).toFixed(1)}</td><td>${(r.cloud_cover_total || 0).toFixed(0)}</td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// === TAB 3: STATYSTYKI DZIENNE ===
document.getElementById('load-daily-stats-btn')?.addEventListener('click', loadDailyStats);

async function loadDailyStats() {
    try {
        const locJson = document.getElementById('daily-location-select').value;
        const measure = document.getElementById('daily-measure-select').value;
        const month = document.getElementById('daily-month-picker').value;

        if (!locJson || !month) {
            showError('Wybierz lokalizację i miesiąc');
            return;
        }

        showLoading(true);
        showError('');

        const [year, monthNum] = month.split('-');
        const startDate = `${year}-${monthNum}-01`;
        const dateObj = new Date(year, parseInt(monthNum), 0);
        const lastDay = dateObj.getDate();
        const endDate = `${year}-${monthNum}-${String(lastDay).padStart(2, '0')}`;

        const loc = JSON.parse(locJson);
        const response = await fetch(
            `${API_CONFIG.SUPABASE_URL}/rest/v1/daily_stats?latitude=eq.${loc.lat.toFixed(2)}&longitude=eq.${loc.lon.toFixed(2)}&date=gte.${startDate}&date=lte.${endDate}&limit=10000`,
            {headers: {'apikey': API_CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json'}}
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const stats = await response.json();
        drawDailyStatsChart(stats, measure);
    } catch (error) {
        showError(`Błąd: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function drawDailyStatsChart(stats, measure) {
    if (!stats || stats.length === 0) {
        document.getElementById('daily-stats-chart').innerHTML = '<p class="placeholder">Brak danych</p>';
        return;
    }

    const values = stats.map(s => s[measure] || 0);
    const maxVal = Math.max(...values, 1);
    let svg = `<svg viewBox="0 0 ${Math.max(400, values.length * 20)} 250" style="width: 100%; height: 300px;">`;

    values.forEach((v, i) => {
        const x = 40 + i * 15;
        const y = 200 - (v / maxVal) * 180;
        const nextX = 40 + (i + 1) * 15;
        const nextY = i < values.length - 1 ? 200 - (values[i+1] / maxVal) * 180 : y;

        if (i === 0) svg += `<polyline points="${x},${y}`;
        else svg += ` ${x},${y}`;
    });

    svg += `" fill="none" stroke="#2563eb" stroke-width="2"/></svg>`;
    document.getElementById('daily-stats-chart').innerHTML = svg;
}

document.addEventListener('DOMContentLoaded', initializeLocationSelects);
