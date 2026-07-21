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
 * Załaduj listę dostępnych miast
 */
async function loadLocations() {
    try {
        showLoading(true);

        const cities = await getAvailableLocations();
        const select = document.getElementById('location-select');

        select.innerHTML = '<option value="">-- Wybierz lokalizację --</option>';

        if (cities.length === 0) {
            showError('Brak dostępnych lokalizacji. Upewnij się, że dane są w bazie Supabase.');
            return;
        }

        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ city_id: city.id, name: city.name });
            option.textContent = city.name;
            select.appendChild(option);
        });

        console.log(`✓ Załadowano ${cities.length} miast`);
    } catch (error) {
        showError(`Błąd przy ładowaniu lokalizacji: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Załaduj dane pogodowe dla wybranego miasta
 */
async function loadWeatherData() {
    try {
        const locationJson = document.getElementById('location-select').value;
        const dateStr = document.getElementById('date-picker').value;

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

        const titleEl = document.getElementById('main-title');
        if (titleEl) titleEl.textContent = `🌤️ Klimat - ${location.name}`;

        const endDate = new Date(dateStr);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 1);

        const weatherRecords = await getWeatherData(
            location.city_id,
            formatDate(startDate),
            formatDate(endDate)
        );

        const dailyStats = await getDailyStats(location.city_id, dateStr);

        processAndDisplayData(weatherRecords, dailyStats, dateStr);

        // Wyświetl mapę ze wszystkimi miastami
        await displayMapWithCities(dateStr);

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
function processAndDisplayData(records, dailyStats, dateStr) {
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

    // Rekordy godzinowe dla wybranego dnia (do rozwinięcia kafelków)
    const dayRecords = records.filter(r => r.forecast_time && r.forecast_time.startsWith(dateStr));
    const dayTemps = dayRecords.map(r => r.temperature_2m).filter(v => v !== null && v !== undefined);
    const median = calculateMedian(dayTemps);
    document.getElementById('temp-median').textContent = median !== null ? median.toFixed(1) : '--';
    displayHourlyBreakdown(dayRecords);

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
 * Oblicza medianę z tablicy liczb
 */
function calculateMedian(arr) {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
        temp_median: calculateMedian(temps),
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
 * Buduje rozwinięcie kafelków temperatury (średnia, mediana, max, min)
 * pokazujące wartość dla każdej dostępnej godziny raportu danego dnia
 * (do 8 punktów: 00, 03, 06, 09, 12, 15, 18, 21 UTC - w zależności od instancji fetch)
 */
function displayHourlyBreakdown(dayRecords) {
    const hourlyRows = [...dayRecords]
        .filter(r => r.temperature_2m !== null && r.temperature_2m !== undefined)
        .sort((a, b) => a.forecast_time.localeCompare(b.forecast_time))
        .map(r => {
            const hour = String(new Date(r.forecast_time).getHours()).padStart(2, '0') + ':00';
            return `<div class="hourly-row"><span>${hour}</span><span>${r.temperature_2m.toFixed(1)}°C</span></div>`;
        })
        .join('');

    const html = hourlyRows || '<div class="hourly-row"><span>Brak danych godzinowych</span></div>';

    ['temp-avg', 'temp-median', 'temp-max', 'temp-min'].forEach(id => {
        const detail = document.getElementById(`${id}-hourly`);
        if (detail) detail.innerHTML = html;
    });
}

// Rozwijanie/zwijanie kafelków temperatury po kliknięciu
document.querySelectorAll('.weather-item.expandable').forEach(item => {
    item.addEventListener('click', () => {
        item.classList.toggle('expanded');
    });
});

/**
 * Zwraca zakres dat (YYYY-MM-DD) dla danego roku i okresu KPI (rok/miesiąc/kwartał/półrocze)
 */
function getPeriodDateRange(year, period) {
    const toISO = (d) => d.toISOString().split('T')[0];
    const monthRanges = {
        q1: [1, 3], q2: [4, 6], q3: [7, 9], q4: [10, 12],
        h1: [1, 6], h2: [7, 12]
    };

    let startMonth = 1, endMonth = 12;
    if (period.startsWith('m')) {
        startMonth = endMonth = parseInt(period.substring(1));
    } else if (monthRanges[period]) {
        [startMonth, endMonth] = monthRanges[period];
    }

    const start = new Date(Date.UTC(year, startMonth - 1, 1));
    const end = new Date(Date.UTC(year, endMonth, 0));
    return { start: toISO(start), end: toISO(end) };
}

/**
 * Pobiera surowe rekordy godzinowe dla danego miasta/roku/okresu (do rozwinięcia KPI)
 */
async function fetchHourlyRecordsForYear(cityId, year, period) {
    const { start, end } = getPeriodDateRange(year, period);
    const pageSize = 1000;
    let offset = 0;
    const allRecords = [];

    try {
        while (true) {
            const response = await fetch(
                `${API_CONFIG.SUPABASE_URL}/rest/v1/weather_data?city_id=eq.${cityId}&forecast_time=gte.${start}T00:00:00Z&forecast_time=lte.${end}T23:59:59Z&select=forecast_time,temperature_2m&order=forecast_time.asc&limit=${pageSize}&offset=${offset}`,
                { headers: { 'apikey': API_CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' } }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const page = await response.json();
            if (!page || page.length === 0) break;

            allRecords.push(...page);
            if (page.length < pageSize) break;
            offset += pageSize;
        }
        return allRecords;
    } catch (error) {
        console.error('Błąd pobierania danych godzinowych KPI:', error);
        return allRecords;
    }
}

/**
 * Grupuje rekordy wg godziny pomiaru (00, 03, 06 ... 21) i liczy dla nich zadaną statystykę
 */
function computeHourlyMetric(records, metric) {
    const buckets = {};
    records.forEach(r => {
        if (r.temperature_2m === null || r.temperature_2m === undefined || !r.forecast_time) return;
        const hour = String(new Date(r.forecast_time).getHours()).padStart(2, '0');
        if (!buckets[hour]) buckets[hour] = [];
        buckets[hour].push(r.temperature_2m);
    });

    return Object.keys(buckets).sort().map(hour => {
        const vals = buckets[hour];
        let value;
        if (metric === 'max') value = Math.max(...vals);
        else if (metric === 'min') value = Math.min(...vals);
        else if (metric === 'median') value = calculateMedian(vals);
        else value = vals.reduce((a, b) => a + b, 0) / vals.length;
        return { hour, value };
    });
}

const KPI_METRIC_LABELS = {
    max: 'Najwyższa temperatura',
    min: 'Najniższa temperatura',
    avg: 'Średnia okresu',
    median: 'Mediana okresu'
};

function openKpiHourlyModal() {
    document.getElementById('kpi-hourly-modal')?.classList.remove('hidden');
}

function closeKpiHourlyModal() {
    document.getElementById('kpi-hourly-modal')?.classList.add('hidden');
}

document.getElementById('kpi-hourly-modal-close')?.addEventListener('click', closeKpiHourlyModal);
document.getElementById('kpi-hourly-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'kpi-hourly-modal') closeKpiHourlyModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeKpiHourlyModal();
});

/**
 * Buduje tabelę porównawczą: wiersze - lata, kolumny - godziny raportu (00-21)
 */
function renderHourlyComparisonTable(yearToHourlyStats) {
    // Godziny UTC pobierania (00/06/12/18 lub 03/09/15/21) po przeliczeniu na czas
    // lokalny przesuwają się o strefę (+1 zimą / +2 latem) - kolumny wyznaczamy
    // dynamicznie z faktycznie napotkanych godzin, żeby nagłówki zawsze pokazywały
    // czas lokalny zgodny z danymi w wierszach.
    const reportHours = Array.from(new Set(
        Object.values(yearToHourlyStats).flatMap(hourlyStats => hourlyStats.map(h => h.hour))
    )).sort();
    const headerCells = reportHours.map(h => `<th>${h}:00</th>`).join('');

    // Wartości po kolumnach (godzinach), do wyznaczenia max/min w każdej kolumnie
    const byHourPerYear = Object.entries(yearToHourlyStats).map(([year, hourlyStats]) => {
        const byHour = {};
        hourlyStats.forEach(h => { byHour[h.hour] = h.value; });
        return { year, byHour };
    });

    const columnExtremes = {};
    reportHours.forEach(h => {
        const values = byHourPerYear.map(row => row.byHour[h]).filter(v => v !== undefined && v !== null);
        columnExtremes[h] = {
            max: values.length > 0 ? Math.max(...values) : null,
            min: values.length > 0 ? Math.min(...values) : null
        };
    });

    const bodyRows = byHourPerYear.map(({ year, byHour }) => {
        const cells = reportHours.map(h => {
            const v = byHour[h];
            if (v === undefined || v === null) return '<td>--</td>';

            const { max, min } = columnExtremes[h];
            let cls = '';
            if (max !== min) {
                if (v === max) cls = ' class="value-highest"';
                else if (v === min) cls = ' class="value-lowest"';
            }
            return `<td${cls}>${v.toFixed(1)}°C</td>`;
        }).join('');
        return `<tr><th>${year}</th>${cells}</tr>`;
    }).join('');

    return `<table class="kpi-hourly-table"><thead><tr><th>Rok</th>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

/**
 * Obsługuje kliknięcie w kafelek KPI - otwiera popup z rozbiciem wskaźnika na godziny pomiaru
 */
async function handleKpiCardClick(card) {
    const metric = card.dataset.metric;
    const modalTitle = document.getElementById('kpi-hourly-modal-title');
    const modalBody = document.getElementById('kpi-hourly-modal-body');
    if (!modalBody) return;

    modalTitle.textContent = `${KPI_METRIC_LABELS[metric] || ''} - rozbicie wg godzin raportu`;
    openKpiHourlyModal();

    if (lastKpiContext.showDecades) {
        modalBody.innerHTML = '<p class="placeholder">Rozwinięcie godzinowe dostępne tylko przy wyłączonej agregacji dekadowej.</p>';
        return;
    }

    if (!lastKpiContext.cityId || lastKpiContext.years.length === 0) {
        modalBody.innerHTML = '<p class="placeholder">Brak danych do rozwinięcia.</p>';
        return;
    }

    modalBody.innerHTML = '<p class="placeholder">Ładowanie…</p>';

    const yearToHourlyStats = {};
    for (const year of lastKpiContext.years) {
        const records = await fetchHourlyRecordsForYear(lastKpiContext.cityId, year, lastKpiContext.period);
        yearToHourlyStats[year] = computeHourlyMetric(records, metric);
    }

    modalBody.innerHTML = renderHourlyComparisonTable(yearToHourlyStats);
}

document.querySelectorAll('.kpi-card.expandable').forEach(card => {
    card.addEventListener('click', () => handleKpiCardClick(card));
});

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

        // Pokaż/ukryj panel sterowania dla profilu rocznego
        const isYearlyTab = (tabId === 'tab-daily-kpis' || tabId === 'tab-daily-chart');
        const controlsContainer = document.getElementById('yearly-controls-container');
        if (controlsContainer) {
            controlsContainer.classList.toggle('hidden', !isYearlyTab);
        }
        updateYearlyControlsSummary();

        // Odśwież wykres po przełączeniu, aby uniknąć problemów z szerokością canvas
        if (tabId === 'tab-daily-chart') {
            setTimeout(() => {
                if (loadedDailyStatsData) {
                    updateYearlyChart();
                }
            }, 50);
        }
    });
});

// === INICJALIZACJA LOKALIZACJI ===
async function initializeLocationSelects() {
    const cities = await getAvailableLocations();

    [document.getElementById('raw-location-select'), document.getElementById('daily-location-select')].forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">-- Wybierz --</option>';
            cities.forEach(city => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({city_id: city.id, name: city.name});
                opt.textContent = city.name;
                select.appendChild(opt);
            });
        }
    });

    // Zastosuj zapamiętane ustawienia profilu rocznego (jeśli są), inaczej domyślnie Warszawa
    const saved = loadYearlySettings();
    const dailySelect = document.getElementById('daily-location-select');
    if (dailySelect) {
        let opt = null;
        if (saved?.cityJson) {
            opt = Array.from(dailySelect.options).find(o => o.value === saved.cityJson);
        }
        if (!opt) {
            opt = Array.from(dailySelect.options).find(o => o.textContent === 'Warszawa');
        }
        if (opt) {
            dailySelect.value = opt.value;

            if (saved) {
                if (saved.measure) document.getElementById('daily-measure-select').value = saved.measure;
                if (typeof saved.showHistoricalBg === 'boolean') document.getElementById('show-historical-bg').checked = saved.showHistoricalBg;
                if (saved.norm) {
                    const normEl = document.getElementById(saved.norm);
                    if (normEl) normEl.checked = true;
                }
                if (typeof saved.onlyEvenYears === 'boolean') document.getElementById('only-even-years').checked = saved.onlyEvenYears;
                if (typeof saved.showDecades === 'boolean') document.getElementById('show-decades').checked = saved.showDecades;
                if (saved.smoothing) document.getElementById('smoothing-select').value = saved.smoothing;
            }

            loadDailyStatsProfile();
        }
    }
}

// === SYNCHRONIZACJA MIĘDZY ZAKŁADKAMI ===
function syncLocationSelects(sourceSelect) {
    const locationValue = sourceSelect.value;
    document.getElementById('location-select').value = locationValue;
    document.getElementById('raw-location-select').value = locationValue;
    document.getElementById('daily-location-select').value = locationValue;
}

function syncDateRange() {
    const dateFrom = document.getElementById('raw-date-from').value;
    if (dateFrom) {
        const date = new Date(dateFrom);
        const year = date.getFullYear();
        const dateTo = `${year}-12-31`;
        document.getElementById('raw-date-to').value = dateTo;
    }
}

function syncYearFromMainDate() {
    const mainDate = document.getElementById('date-picker').value;
    if (mainDate) {
        const date = new Date(mainDate);
        const year = date.getFullYear();
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;

        document.getElementById('raw-date-from').value = startOfYear;
        document.getElementById('raw-date-to').value = endOfYear;

        document.getElementById('daily-month-picker').value = mainDate.substring(0, 7);
    }
}

// Nasłuchiwanie zmian
document.getElementById('location-select')?.addEventListener('change', (e) => syncLocationSelects(e.target));
document.getElementById('raw-location-select')?.addEventListener('change', (e) => syncLocationSelects(e.target));
document.getElementById('daily-location-select')?.addEventListener('change', (e) => syncLocationSelects(e.target));
document.getElementById('raw-date-from')?.addEventListener('change', syncDateRange);
document.getElementById('date-picker')?.addEventListener('change', syncYearFromMainDate);

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
            `${API_CONFIG.SUPABASE_URL}/rest/v1/weather_data?city_id=eq.${loc.city_id}&forecast_time=gte.${dateFrom}T00:00:00Z&forecast_time=lte.${dateTo}T23:59:59Z&order=forecast_time.asc&limit=10000`,
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

    let html = `<table><thead><tr><th>Data</th><th>Godzina (czas lok.)</th><th>Temp (°C)</th><th>Wiatr (m/s)</th><th>Kierunek (°)</th><th>Opady (mm)</th><th>Chmury (%)</th></tr></thead><tbody>`;
    records.forEach(r => {
        const date = new Date(r.forecast_time);
        html += `<tr><td>${date.toLocaleDateString('pl-PL')}</td><td>${String(date.getHours()).padStart(2, '0')}:00</td><td>${(r.temperature_2m || 0).toFixed(1)}</td><td>${(r.wind_speed_10m || 0).toFixed(1)}</td><td>${(r.wind_direction_10m || 0).toFixed(0)}</td><td>${(r.precipitation_6h || 0).toFixed(1)}</td><td>${(r.cloud_cover_total || 0).toFixed(0)}</td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// === TAB 3: PROFIL ROCZNY (PORÓWNANIE LAT) ===
let loadedDailyStatsData = null;
let currentDailyCityId = null;
let lastKpiContext = { cityId: null, period: 'year', years: [], showDecades: false };

// === ZAPAMIĘTYWANIE USTAWIEŃ PROFILU ROCZNEGO (localStorage) ===
const YEARLY_SETTINGS_KEY = 'klimatpolski_yearly_settings';

function loadYearlySettings() {
    try {
        return JSON.parse(localStorage.getItem(YEARLY_SETTINGS_KEY)) || null;
    } catch (e) {
        return null;
    }
}

function saveYearlySettings() {
    const checkedNorm = document.querySelector('input[name="climate-norm"]:checked');
    const listContainer = document.getElementById('highlight-years-list');
    const showDecades = document.getElementById('show-decades')?.checked ?? false;

    const settings = {
        cityJson: document.getElementById('daily-location-select')?.value || null,
        measure: document.getElementById('daily-measure-select')?.value,
        showHistoricalBg: document.getElementById('show-historical-bg')?.checked,
        norm: checkedNorm ? checkedNorm.id : null,
        onlyEvenYears: document.getElementById('only-even-years')?.checked,
        showDecades,
        smoothing: document.getElementById('smoothing-select')?.value,
        highlightedYears: showDecades ? null : Array.from(listContainer?.querySelectorAll('input[type="checkbox"]:checked') || []).map(cb => parseInt(cb.value)),
        visibleDecades: showDecades ? Array.from(listContainer?.querySelectorAll('input[type="checkbox"]:checked') || []).map(cb => cb.value) : null
    };

    localStorage.setItem(YEARLY_SETTINGS_KEY, JSON.stringify(settings));
}

document.getElementById('load-daily-stats-btn')?.addEventListener('click', loadDailyStatsProfile);

// Reaguj na zmianę opcji
['daily-measure-select', 'show-historical-bg', 'show-norm-1991-2020', 'show-norm-1981-2010', 'show-norm-1980-2000', 'show-norm-1960-1990', 'show-norm-none', 'show-decades', 'smoothing-select'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        if (id === 'show-decades') {
            handleDecadesToggle();
        }
        updateYearlyChart();
        saveYearlySettings();
    });
});

document.getElementById('only-even-years')?.addEventListener('change', () => {
    setupHighlightYearsList();
    updateYearlyChart();
    saveYearlySettings();
});

document.getElementById('yearly-controls-container')?.addEventListener('toggle', updateYearlyControlsSummary);
document.getElementById('daily-location-select')?.addEventListener('change', () => {
    loadDailyStatsProfile();
    saveYearlySettings();
});
document.getElementById('kpi-period-select')?.addEventListener('change', updateYearlyChart);

async function loadDailyStatsProfile() {
    try {
        const locJson = document.getElementById('daily-location-select').value;
        if (!locJson) {
            showError('Wybierz lokalizację');
            return;
        }

        showLoading(true);
        showError('');

        const loc = JSON.parse(locJson);
        currentDailyCityId = loc.city_id;

        const titleEl = document.getElementById('main-title');
        if (titleEl) titleEl.textContent = `🌤️ Klimat - ${loc.name}`;

        loadedDailyStatsData = await getAllDailyStats(loc.city_id);

        if (!loadedDailyStatsData || loadedDailyStatsData.length === 0) {
            showError('Brak danych statystyk dziennych dla tej lokalizacji.');
            showLoading(false);
            return;
        }

        const years = Array.from(new Set(loadedDailyStatsData.map(r => new Date(r.date).getFullYear()))).sort();
        window.loadedAvailableYears = years;

        // Ustaw stan początkowy opcji dekadowych
        handleDecadesToggle();

        // Wyciągamy lata najpierw
        const measure = document.getElementById('daily-measure-select')?.value || 'temp_avg';
        const config = {
            showHistoricalBg: document.getElementById('show-historical-bg')?.checked ?? true,
            showNorm1991_2020: document.getElementById('show-norm-1991-2020')?.checked ?? true,
            showNorm1981_2010: document.getElementById('show-norm-1981-2010')?.checked ?? false,
            showNorm1980_2000: document.getElementById('show-norm-1980-2000')?.checked ?? false,
            showNorm1960_1990: document.getElementById('show-norm-1960-1990')?.checked ?? false,
            onlyEvenYears: document.getElementById('only-even-years')?.checked ?? false,
            showDecades: document.getElementById('show-decades')?.checked ?? false,
            smoothing: document.getElementById('smoothing-select')?.value || 'none',
            highlightedYears: [2026, 2025, 2024, 2023]
        };
        
        drawYearlyComparisonChart('yearly-comparison-chart', loadedDailyStatsData, measure, config);

        // Skonfiguruj listę lat do wyróżnienia
        setupHighlightYearsList();

        // Narysuj ostatecznie z wybranymi filtrami
        updateYearlyChart();

    } catch (error) {
        showError(`Błąd przy ładowaniu profilu rocznego: ${error.message}`);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

function handleDecadesToggle() {
    setupHighlightYearsList();
}

function setupHighlightYearsList() {
    const listContainer = document.getElementById('highlight-years-list');
    const container = document.getElementById('highlight-years-container');
    const labelEl = document.getElementById('highlight-years-label');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    // Dodaj obsługę zdarzenia toggle jeśli jeszcze jej nie ma
    if (container && !container.dataset.hasToggleListener) {
        container.addEventListener('toggle', updateSummaryText);
        container.dataset.hasToggleListener = 'true';
    }
    
    const showDecades = document.getElementById('show-decades')?.checked ?? false;
    const years = window.loadedAvailableYears || [];

    if (years.length === 0) {
        container?.classList.add('hidden');
        return;
    }

    container?.classList.remove('hidden');

    if (showDecades) {
        if (labelEl) labelEl.textContent = 'Widoczne dekady:';
        
        // Wyciągamy unikalne dekady
        const decades = new Set();
        years.forEach(year => {
            const decadeStart = Math.floor(year / 10) * 10;
            decades.add(`${decadeStart}s`);
        });

        // Tworzymy checkboxy dla dekad (domyślnie wszystkie zaznaczone, lub wg zapamiętanych ustawień)
        const savedForDecades = loadYearlySettings();
        const savedVisibleDecades = savedForDecades?.showDecades ? savedForDecades.visibleDecades : null;

        Array.from(decades).sort().reverse().forEach(decade => {
            const item = document.createElement('div');
            item.className = 'checkbox-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `visible-decade-${decade}`;
            checkbox.value = decade;
            checkbox.checked = savedVisibleDecades ? savedVisibleDecades.includes(decade) : true;
            checkbox.addEventListener('change', () => {
                updateYearlyChart();
                saveYearlySettings();
            });

            const label = document.createElement('label');
            label.htmlFor = `visible-decade-${decade}`;
            label.textContent = decade.replace('s', 's.');

            item.appendChild(checkbox);
            item.appendChild(label);
            listContainer.appendChild(item);
        });
    } else {
        if (labelEl) labelEl.textContent = 'Wyróżnione lata:';

        const savedForYears = loadYearlySettings();
        const defaultHighlighted = (savedForYears && !savedForYears.showDecades && savedForYears.highlightedYears)
            ? savedForYears.highlightedYears
            : [2026, 2025, 2024, 2023];

        years.forEach(year => {
            const item = document.createElement('div');
            item.className = 'checkbox-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `highlight-year-${year}`;
            checkbox.value = year;
            checkbox.checked = defaultHighlighted.includes(year);
            checkbox.addEventListener('change', (e) => {
                // Ograniczenie do max 8 zaznaczonych lat
                const checked = listContainer.querySelectorAll('input[type="checkbox"]:checked');
                if (checked.length > 8) {
                    checkbox.checked = false;
                    alert('Możesz wyróżnić maksymalnie 8 lat jednocześnie.');
                    return;
                }
                updateYearlyChart();
                saveYearlySettings();
            });

            const label = document.createElement('label');
            label.htmlFor = `highlight-year-${year}`;
            label.textContent = year;

            item.appendChild(checkbox);
            item.appendChild(label);
            listContainer.appendChild(item);
        });
    }
}

function updateYearlyChart() {
    if (!loadedDailyStatsData) return;

    const measure = document.getElementById('daily-measure-select')?.value || 'temp_avg';
    const showHistoricalBg = document.getElementById('show-historical-bg')?.checked ?? true;
    const showNorm1991_2020 = document.getElementById('show-norm-1991-2020')?.checked ?? true;
    const showNorm1981_2010 = document.getElementById('show-norm-1981-2010')?.checked ?? false;
    const showNorm1980_2000 = document.getElementById('show-norm-1980-2000')?.checked ?? false;
    const showNorm1960_1990 = document.getElementById('show-norm-1960-1990')?.checked ?? false;
    const onlyEvenYears = document.getElementById('only-even-years')?.checked ?? false;
    const showDecades = document.getElementById('show-decades')?.checked ?? false;
    const smoothing = document.getElementById('smoothing-select')?.value || 'none';

    // Zbierz zaznaczone lata / widoczne dekady z checkboxów
    const highlightedYears = [];
    const visibleDecades = [];
    const checkboxes = document.querySelectorAll('#highlight-years-list input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.checked) {
            if (showDecades) {
                visibleDecades.push(cb.value);
            } else {
                highlightedYears.push(parseInt(cb.value));
            }
        }
    });

    const config = {
        showHistoricalBg,
        showNorm1991_2020,
        showNorm1981_2010,
        showNorm1980_2000,
        showNorm1960_1990,
        onlyEvenYears,
        showDecades,
        smoothing,
        highlightedYears,
        visibleDecades
    };

    // Zaktualizuj tekst podsumowania w summary
    updateSummaryText();
    updateYearlyControlsSummary();

    // --- OBLICZANIE KPI ---
    let filteredRecordsForKpi = [];
    let numYearsForKpi = 0;
    const availableYearsSet = new Set(window.loadedAvailableYears || []);

    if (showDecades) {
        filteredRecordsForKpi = loadedDailyStatsData.filter(r => {
            const year = new Date(r.date).getFullYear();
            if (year === 2026) return false; // Pomijamy niepełny rok 2026 w średnich dekadowych
            if (!availableYearsSet.has(year)) return false;
            if (onlyEvenYears && year % 2 !== 0) return false;
            const decade = Math.floor(year / 10) * 10 + 's';
            return visibleDecades.includes(decade);
        });
        numYearsForKpi = new Set(filteredRecordsForKpi.map(r => new Date(r.date).getFullYear())).size;
    } else {
        filteredRecordsForKpi = loadedDailyStatsData.filter(r => {
            const year = new Date(r.date).getFullYear();
            if (onlyEvenYears && year % 2 !== 0) return false;
            return highlightedYears.includes(year);
        });
        numYearsForKpi = highlightedYears.length;
    }

updateKPIs(filteredRecordsForKpi, numYearsForKpi, showDecades);

    drawYearlyComparisonChart('yearly-comparison-chart', loadedDailyStatsData, measure, config);
}

function updateKPIs(filteredRecords, numYears, showDecades) {
    const kpiContainer = document.getElementById('yearly-kpi-container');
    if (!kpiContainer) return;

    if (!filteredRecords || filteredRecords.length === 0 || numYears === 0) {
        kpiContainer.classList.add('hidden');
        return;
    }

    kpiContainer.classList.remove('hidden');

    // 1. Odczytaj okres i zaktualizuj tytuły
    const periodSelect = document.getElementById('kpi-period-select');
    const period = periodSelect ? periodSelect.value : 'year';
    const periodText = periodSelect ? periodSelect.options[periodSelect.selectedIndex]?.text : 'Cały rok';

    document.querySelectorAll('.kpi-title').forEach(el => {
        const base = el.getAttribute('data-base-title');
        if (base) {
            el.textContent = `${base} (${periodText})`;
        }
    });

    // 2. Przefiltruj rekordy dla wybranego okresu
    const filterRecordsByPeriod = (records, p) => {
        if (p === 'year') return records;
        return records.filter(r => {
            const date = new Date(r.date);
            const month = date.getMonth(); // 0-11
            
            if (p.startsWith('m')) {
                const mNum = parseInt(p.substring(1)) - 1;
                return month === mNum;
            }
            if (p === 'q1') return month >= 0 && month <= 2;
            if (p === 'q2') return month >= 3 && month <= 5;
            if (p === 'q3') return month >= 6 && month <= 8;
            if (p === 'q4') return month >= 9 && month <= 11;
            if (p === 'h1') return month >= 0 && month <= 5;
            if (p === 'h2') return month >= 6 && month <= 11;
            
            return true;
        });
    };

    const periodRecords = filterRecordsByPeriod(filteredRecords, period);

    // 3. Grupujemy rekordy według roku lub dekady
    const grouped = {};
    periodRecords.forEach(r => {
        const year = new Date(r.date).getFullYear();
        const key = showDecades ? (Math.floor(year / 10) * 10 + 's') : year;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
    });

    // Zapamiętaj kontekst KPI do rozwinięcia godzinowego po kliknięciu w kafelek
    lastKpiContext = {
        cityId: currentDailyCityId,
        period,
        years: showDecades ? [] : Object.keys(grouped).map(k => parseInt(k)).sort((a, b) => a - b),
        showDecades
    };
    closeKpiHourlyModal();

    const calculateMedian = (arr) => {
        if (arr.length === 0) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 
            ? sorted[mid] 
            : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const calculateAverage = (arr) => arr.length > 0
        ? arr.reduce((sum, value) => sum + value, 0) / arr.length
        : null;

    const kpis = {
        tempMax: {},
        tempMin: {},
        tempMaxAvg: {},
        tempMinAvg: {},
        tempYearAvg: {},
        tempMedian: {},
        daysHot: {},
        daysCool: {},
        daysTropical: {},
        daysGlacial: {},
        maxDiurnalRange: {}
    };

    Object.keys(grouped).forEach(key => {
        const records = grouped[key];
        const validMax = records.map(r => r.temp_max).filter(v => v !== null && v !== undefined);
        const validMin = records.map(r => r.temp_min).filter(v => v !== null && v !== undefined);
        const validAvg = records.map(r => r.temp_avg).filter(v => v !== null && v !== undefined);

        let tempMax = validMax.length > 0 ? Math.max(...validMax) : null;
        let tempMin = validMin.length > 0 ? Math.min(...validMin) : null;
        let tempMaxAvg = validAvg.length > 0 ? Math.max(...validAvg) : null;
        let tempMinAvg = validAvg.length > 0 ? Math.min(...validAvg) : null;

        if (showDecades) {
            const recordsByYear = {};
            records.forEach(record => {
                const year = new Date(record.date).getFullYear();
                if (!recordsByYear[year]) recordsByYear[year] = [];
                recordsByYear[year].push(record);
            });

            const yearlyExtremes = Object.values(recordsByYear).map(yearRecords => {
                const yearlyMax = yearRecords.map(r => r.temp_max).filter(v => v !== null && v !== undefined);
                const yearlyMin = yearRecords.map(r => r.temp_min).filter(v => v !== null && v !== undefined);
                const yearlyAvg = yearRecords.map(r => r.temp_avg).filter(v => v !== null && v !== undefined);
                return {
                    tempMax: yearlyMax.length > 0 ? Math.max(...yearlyMax) : null,
                    tempMin: yearlyMin.length > 0 ? Math.min(...yearlyMin) : null,
                    tempMaxAvg: yearlyAvg.length > 0 ? Math.max(...yearlyAvg) : null,
                    tempMinAvg: yearlyAvg.length > 0 ? Math.min(...yearlyAvg) : null
                };
            });

            const averageYearlyMetric = (metric) => calculateAverage(
                yearlyExtremes.map(values => values[metric]).filter(value => value !== null)
            );
            tempMax = averageYearlyMetric('tempMax');
            tempMin = averageYearlyMetric('tempMin');
            tempMaxAvg = averageYearlyMetric('tempMaxAvg');
            tempMinAvg = averageYearlyMetric('tempMinAvg');
        }

        kpis.tempMax[key] = tempMax !== null ? tempMax.toFixed(1) + '°C' : '--';
        kpis.tempMin[key] = tempMin !== null ? tempMin.toFixed(1) + '°C' : '--';
        kpis.tempMaxAvg[key] = tempMaxAvg !== null ? tempMaxAvg.toFixed(1) + '°C' : '--';
        kpis.tempMinAvg[key] = tempMinAvg !== null ? tempMinAvg.toFixed(1) + '°C' : '--';
        kpis.tempYearAvg[key] = validAvg.length > 0 ? (validAvg.reduce((a, b) => a + b, 0) / validAvg.length).toFixed(1) + '°C' : '--';
        
        const med = calculateMedian(validAvg);
        kpis.tempMedian[key] = med !== null ? med.toFixed(1) + '°C' : '--';

        const yearsCount = showDecades ? (new Set(records.map(r => new Date(r.date).getFullYear()))).size : 1;

        const formatPolishUnit = (val, type) => {
            if (val % 1 !== 0) {
                const formatted = val.toFixed(1);
                if (type === 'day') return `${formatted} dnia/r`;
                if (type === 'night') return `${formatted} nocy/r`;
                return `${formatted} ${type}`;
            }
            const intVal = Math.round(val);
            if (type === 'day') {
                if (intVal === 1) return '1 dzień';
                return `${intVal} dni`;
            }
            if (type === 'night') {
                if (intVal === 1) return '1 noc';
                const lastDigit = intVal % 10;
                const lastTwo = intVal % 100;
                if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 10 || lastTwo > 20)) {
                    return `${intVal} noce`;
                }
                return `${intVal} nocy`;
            }
            return val;
        };

        const hotDays = records.filter(r => r.temp_max !== null && r.temp_max !== undefined && r.temp_max > 30).length;
        kpis.daysHot[key] = formatPolishUnit(hotDays / yearsCount, 'day');

        const warmDays = records.filter(r => r.temp_max !== null && r.temp_max !== undefined && r.temp_max >= 20).length;
        kpis.daysCool[key] = formatPolishUnit(warmDays / yearsCount, 'day');

        const tropicalNights = records.filter(r => r.temp_min !== null && r.temp_min !== undefined && r.temp_min >= 20).length;
        kpis.daysTropical[key] = formatPolishUnit(tropicalNights / yearsCount, 'night');

        const glacialDays = records.filter(r => r.temp_max !== null && r.temp_max !== undefined && r.temp_max <= -10).length;
        kpis.daysGlacial[key] = formatPolishUnit(glacialDays / yearsCount, 'day');

        const diurnalRanges = records
            .filter(r => r.temp_max !== null && r.temp_max !== undefined && r.temp_min !== null && r.temp_min !== undefined)
            .map(r => r.temp_max - r.temp_min);
        kpis.maxDiurnalRange[key] = diurnalRanges.length > 0 ? Math.max(...diurnalRanges).toFixed(1) + '°C' : '--';
    });

    const renderKpiRows = (kpiMap) => {
        return Object.keys(kpiMap)
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
            .map(key => {
                const label = showDecades ? key.replace('s', 's.') : key;
                return `<div class="kpi-year-row">
                    <span class="year-label">${label}:</span>
                    <span class="year-val">${kpiMap[key]}</span>
                </div>`;
            }).join('');
    };

    document.getElementById('kpi-temp-max').innerHTML = renderKpiRows(kpis.tempMax);
    document.getElementById('kpi-temp-min').innerHTML = renderKpiRows(kpis.tempMin);
    document.getElementById('kpi-temp-max-avg').innerHTML = renderKpiRows(kpis.tempMaxAvg);
    document.getElementById('kpi-temp-min-avg').innerHTML = renderKpiRows(kpis.tempMinAvg);
    document.getElementById('kpi-temp-year-avg').innerHTML = renderKpiRows(kpis.tempYearAvg);
    document.getElementById('kpi-temp-median').innerHTML = renderKpiRows(kpis.tempMedian);
    document.getElementById('kpi-days-hot').innerHTML = renderKpiRows(kpis.daysHot);
    document.getElementById('kpi-days-cool').innerHTML = renderKpiRows(kpis.daysCool);
    document.getElementById('kpi-days-tropical').innerHTML = renderKpiRows(kpis.daysTropical);
    document.getElementById('kpi-days-glacial').innerHTML = renderKpiRows(kpis.daysGlacial);
    document.getElementById('kpi-max-diurnal-range').innerHTML = renderKpiRows(kpis.maxDiurnalRange);
}

function updateSummaryText() {
    const container = document.getElementById('highlight-years-container');
    const textEl = document.getElementById('highlight-years-summary-text');
    if (!container || !textEl) return;

    if (container.open) {
        textEl.textContent = ' (kliknij, aby zwinąć)';
        textEl.style.fontWeight = 'normal';
        textEl.style.color = 'var(--text-secondary)';
    } else {
        const checkedLabels = [];
        const checkboxes = document.querySelectorAll('#highlight-years-list input[type="checkbox"]:checked');
        checkboxes.forEach(cb => {
            const label = document.querySelector(`label[for="${cb.id}"]`)?.textContent;
            if (label) checkedLabels.push(label);
        });
        
        if (checkedLabels.length > 0) {
            textEl.textContent = ' ' + checkedLabels.join(', ');
            textEl.style.fontWeight = 'bold';
            textEl.style.color = 'var(--primary-color)';
        } else {
            textEl.textContent = ' brak zaznaczonych';
            textEl.style.fontWeight = 'normal';
            textEl.style.color = 'var(--text-secondary)';
        }
    }
}

function updateYearlyControlsSummary() {
    const container = document.getElementById('yearly-controls-container');
    const textEl = document.getElementById('yearly-controls-summary-text');
    if (!container || !textEl) return;

    if (container.open) {
        textEl.textContent = ' (kliknij, aby zwinąć)';
        textEl.style.fontWeight = 'normal';
        textEl.style.color = 'var(--text-secondary)';
    } else {
        // Lokalizacja
        const locSelect = document.getElementById('daily-location-select');
        let city = 'Brak lokalizacji';
        if (locSelect && locSelect.value) {
            try {
                const locObj = JSON.parse(locSelect.value);
                city = locObj.name;
            } catch(e) {}
        }
        const cityHtml = `<span class="summary-city">${city}</span>`;

        // Miara - dotyczy tylko wykresu porównawczego, nie kafelków KPI (zawsze temperaturowych)
        const isKpiTab = document.getElementById('tab-daily-kpis')?.classList.contains('active');
        const measureSelect = document.getElementById('daily-measure-select');
        const measure = measureSelect ? measureSelect.options[measureSelect.selectedIndex]?.text : '--';
        const measureHtml = isKpiTab ? '' : `<span class="summary-measure">${measure}</span> &nbsp; | &nbsp; `;

        // Norma
        let norm = 'Brak normy';
        ['show-norm-1991-2020', 'show-norm-1981-2010', 'show-norm-1980-2000', 'show-norm-1960-1990'].forEach(id => {
            if (document.getElementById(id)?.checked) {
                const label = document.querySelector(`label[for="${id}"]`)?.textContent;
                if (label) norm = label;
            }
        });
        const normHtml = `<span class="summary-norm">${norm}</span>`;

        // Lata / Dekady (kolorowanie pasujące do wykresu)
        const showDecades = document.getElementById('show-decades')?.checked ?? false;
        const selectedItems = [];
        const checkboxes = document.querySelectorAll('#highlight-years-list input[type="checkbox"]:checked');
        checkboxes.forEach(cb => {
            const label = document.querySelector(`label[for="${cb.id}"]`)?.textContent;
            if (label) selectedItems.push({ value: cb.value, text: label });
        });

        // Sortowanie malejąco
        selectedItems.sort((a, b) => b.value.localeCompare(a.value, undefined, { numeric: true }));

        let modeHtml = '';
        if (showDecades) {
            const decadeColors = {
                "2020s": '#dc2626', "2010s": '#ea580c', "2000s": '#d97706', "1990s": '#16a34a',
                "1980s": '#2563eb', "1970s": '#4f46e5', "1960s": '#9333ea', "1950s": '#db2777'
            };
            const coloredItems = selectedItems.map(item => {
                const color = decadeColors[item.value] || '#6b7280';
                return `<span style="color: ${color}; font-weight: bold; text-shadow: 0 0 1px rgba(0,0,0,0.05);">${item.text}</span>`;
            });
            modeHtml = `Dekady: ${coloredItems.length > 0 ? coloredItems.join(', ') : 'brak'}`;
        } else {
            const yearColors = ['#dc2626', '#ea580c', '#d97706', '#16a34a', '#2563eb', '#4f46e5', '#9333ea', '#db2777'];
            const coloredItems = selectedItems.map((item, idx) => {
                const color = yearColors[idx] || '#2563eb';
                return `<span style="color: ${color}; font-weight: bold; text-shadow: 0 0 1px rgba(0,0,0,0.05);">${item.text}</span>`;
            });
            modeHtml = `Lata: ${coloredItems.length > 0 ? coloredItems.join(', ') : 'brak'}`;
        }

        textEl.innerHTML = ` &nbsp; ${cityHtml} &nbsp; | &nbsp; ${measureHtml}${normHtml} &nbsp; | &nbsp; <strong>${modeHtml}</strong>`;
        textEl.style.fontWeight = 'normal';
        textEl.style.color = 'var(--text-secondary)';
    }
}

document.addEventListener('DOMContentLoaded', initializeLocationSelects);


