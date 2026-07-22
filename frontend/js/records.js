/**
 * Rekordy klimatyczne obliczane z dziennych statystyk i punktowych pomiarow.
 */

const RECORD_METRICS = [
    { key: 'periodAverage', title: 'Najwyższa średnia okresu', direction: 'desc', unit: 'temperature', completedPeriodsOnly: true },
    { key: 'periodAverage', title: 'Najniższa średnia okresu', direction: 'asc', unit: 'temperature', completedPeriodsOnly: true },
    { key: 'periodMedian', title: 'Najwyższa mediana okresu', direction: 'desc', unit: 'temperature', completedPeriodsOnly: true },
    { key: 'tempMax', title: 'Najwyższa temperatura', direction: 'desc', unit: 'temperature' },
    { key: 'tempMin', title: 'Najniższa temperatura', direction: 'asc', unit: 'temperature' },
    { key: 'tempMaxAvg', title: 'Najwyższa średnia dobowa', direction: 'desc', unit: 'temperature' },
    { key: 'tempMinAvg', title: 'Najniższa średnia dobowa', direction: 'asc', unit: 'temperature' },
    { key: 'precipitationTotal', title: 'Największe opady', direction: 'desc', unit: 'precipitation', completedPeriodsOnly: true },
    { key: 'precipitationTotal', title: 'Najmniejsze opady', direction: 'asc', unit: 'precipitation', completedPeriodsOnly: true },
    { key: 'windAverage', title: 'Najsilniejszy wiatr', direction: 'desc', unit: 'wind', completedPeriodsOnly: true },
    { key: 'windAverage', title: 'Najsłabszy wiatr', direction: 'asc', unit: 'wind', completedPeriodsOnly: true },
    { key: 'cloudAverage', title: 'Największe zachmurzenie', direction: 'desc', unit: 'cloud', completedPeriodsOnly: true },
    { key: 'cloudAverage', title: 'Najmniejsze zachmurzenie', direction: 'asc', unit: 'cloud', completedPeriodsOnly: true },
    { key: 'rainyDays', title: 'Najwięcej dni deszczowych (opad > 0 mm)', direction: 'desc', unit: 'days', positiveOnly: true, completedPeriodsOnly: true },
    { key: 'rainyDays', title: 'Najmniej dni deszczowych (opad > 0 mm)', direction: 'asc', unit: 'days', completedPeriodsOnly: true },
    { key: 'daysHot', title: 'Najwięcej dni upalnych (T.Max > 30°C)', direction: 'desc', unit: 'days', positiveOnly: true, completedPeriodsOnly: true },
    { key: 'daysWarm', title: 'Najwięcej dni ciepłych (T.Max >= 20°C)', direction: 'desc', unit: 'days', positiveOnly: true, completedPeriodsOnly: true },
    { key: 'daysFrosty', title: 'Najwięcej dni mroźnych (T.Min < 0°C)', direction: 'desc', unit: 'days', positiveOnly: true, completedPeriodsOnly: true },
    { key: 'daysGlacial', title: 'Najwięcej dni bardzo mroźnych (T.Min < -10°C)', direction: 'desc', unit: 'days', positiveOnly: true, completedPeriodsOnly: true },
    { key: 'tropicalNights', title: 'Najwięcej nocy tropikalnych (T.Min >= 20°C)', direction: 'desc', unit: 'nights', positiveOnly: true, completedPeriodsOnly: true },
    { key: 'maxDiurnalRange', title: 'Największa dobowa amplituda', direction: 'desc', unit: 'temperature' }
];

const RECORD_MONTH_NAMES = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'
];

const RECORD_MONTH_NAMES_GENITIVE = [
    'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'
];

const recordsState = {
    granularity: 'year',
    cityId: null,
    dailyStats: null,
    requestId: 0
};

function recordAverage(values) {
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function recordMedian(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function validRecordValues(records, field) {
    return records
        .map(record => record[field])
        .filter(value => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(value => Number.isFinite(value));
}

function getIsoWeek(dateString) {
    const source = new Date(`${dateString}T12:00:00`);
    const date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const isoYear = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return { year: isoYear, week };
}

function getWeekDateRangeLabel(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    const day = date.getDay() || 7;
    const start = new Date(date);
    start.setDate(date.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const startDay = start.getDate();
    const endDay = end.getDate();
    const startMonth = RECORD_MONTH_NAMES_GENITIVE[start.getMonth()];
    const endMonth = RECORD_MONTH_NAMES_GENITIVE[end.getMonth()];
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    if (startYear !== endYear) {
        return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`;
    }
    if (start.getMonth() !== end.getMonth()) {
        return `${startDay} ${startMonth} - ${endDay} ${endMonth}, ${endYear}`;
    }
    return `${startDay}-${endDay} ${endMonth}, ${endYear}`;
}

function getRecordPeriod(record, granularity) {
    const dateString = record.date;
    const [year, month] = dateString.split('-').map(Number);

    if (granularity === 'year') {
        return { key: String(year), label: String(year), sortKey: dateString };
    }

    if (granularity === 'month') {
        return {
            key: dateString.slice(0, 7),
            label: `${RECORD_MONTH_NAMES[month - 1]} ${year}`,
            sortKey: dateString
        };
    }

    if (granularity === 'week') {
        const iso = getIsoWeek(dateString);
        return {
            key: `${iso.year}-W${String(iso.week).padStart(2, '0')}`,
            label: getWeekDateRangeLabel(dateString),
            sortKey: dateString
        };
    }

    return {
        key: dateString,
        label: new Date(`${dateString}T12:00:00`).toLocaleDateString('pl-PL'),
        sortKey: dateString
    };
}

function getCurrentRecordPeriodKey(granularity, now = new Date()) {
    const year = now.getFullYear();

    if (granularity === 'year') return String(year);
    if (granularity === 'month') {
        return `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (granularity === 'week') {
        const dateString = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const iso = getIsoWeek(dateString);
        return `${iso.year}-W${String(iso.week).padStart(2, '0')}`;
    }

    return null;
}

function summarizeRecordPeriod(period) {
    const records = period.records;
    const maxValues = validRecordValues(records, 'temp_max');
    const minValues = validRecordValues(records, 'temp_min');
    const averageValues = validRecordValues(records, 'temp_avg');
    const precipitationValues = validRecordValues(records, 'precipitation_sum');
    const windValues = validRecordValues(records, 'wind_speed_avg');
    const cloudValues = validRecordValues(records, 'cloud_cover_avg');
    const ranges = records
        .filter(record => record.temp_max !== null && record.temp_max !== undefined)
        .filter(record => record.temp_min !== null && record.temp_min !== undefined)
        .filter(record => Number.isFinite(Number(record.temp_max)) && Number.isFinite(Number(record.temp_min)))
        .map(record => Number(record.temp_max) - Number(record.temp_min));

    return {
        label: period.label,
        sortKey: period.sortKey,
        isComplete: period.isComplete,
        periodAverage: recordAverage(averageValues),
        periodMedian: recordMedian(averageValues),
        tempMax: maxValues.length > 0 ? Math.max(...maxValues) : null,
        tempMin: minValues.length > 0 ? Math.min(...minValues) : null,
        tempMaxAvg: averageValues.length > 0 ? Math.max(...averageValues) : null,
        tempMinAvg: averageValues.length > 0 ? Math.min(...averageValues) : null,
        precipitationTotal: precipitationValues.length > 0
            ? precipitationValues.reduce((sum, value) => sum + value, 0)
            : null,
        windAverage: recordAverage(windValues),
        cloudAverage: recordAverage(cloudValues),
        rainyDays: records.filter(record => Number(record.precipitation_sum) > 0).length,
        daysHot: records.filter(record => Number(record.temp_max) > 30).length,
        daysWarm: records.filter(record => Number(record.temp_max) >= 20).length,
        daysFrosty: records.filter(record => Number(record.temp_min) < 0).length,
        daysGlacial: records.filter(record => Number(record.temp_min) < -10).length,
        tropicalNights: records.filter(record => Number(record.temp_min) >= 20).length,
        maxDiurnalRange: ranges.length > 0 ? Math.max(...ranges) : null
    };
}

function groupRecordsByPeriod(records, granularity, now = new Date()) {
    const groups = new Map();

    records.forEach(record => {
        if (!record.date) return;
        const period = getRecordPeriod(record, granularity);
        if (!groups.has(period.key)) {
            groups.set(period.key, { ...period, records: [] });
        }
        const group = groups.get(period.key);
        group.records.push(record);
        if (record.date > group.sortKey) group.sortKey = record.date;
    });

    const currentPeriodKey = getCurrentRecordPeriodKey(granularity, now);
    return Array.from(groups.values())
        .map(group => ({
            ...group,
            isComplete: currentPeriodKey === null || group.key < currentPeriodKey
        }))
        .map(summarizeRecordPeriod);
}

function getTopRecordPeriods(summaries, metric) {
    return summaries
        .filter(summary => Number.isFinite(summary[metric.key]))
        .filter(summary => !metric.completedPeriodsOnly || summary.isComplete)
        .filter(summary => !metric.positiveOnly || summary[metric.key] > 0)
        .sort((a, b) => {
            const difference = metric.direction === 'asc'
                ? a[metric.key] - b[metric.key]
                : b[metric.key] - a[metric.key];
            return difference || b.sortKey.localeCompare(a.sortKey);
        })
        .slice(0, 5);
}

function formatRecordValue(value, unit) {
    if (unit === 'temperature') return `${value.toFixed(1)}°C`;
    if (unit === 'precipitation') return `${value.toFixed(1)} mm`;
    if (unit === 'wind') return `${value.toFixed(1)} m/s`;
    if (unit === 'cloud') return `${value.toFixed(1)}%`;
    if (unit === 'nights') return `${value} ${value === 1 ? 'noc' : 'nocy'}`;
    return `${value} ${value === 1 ? 'dzień' : 'dni'}`;
}

function escapeRecordHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderRecordRows(records, valueFormatter) {
    if (records.length === 0) {
        return '<div class="records-empty">Brak rekordów</div>';
    }

    return `<ol class="records-list">${records.map((record, index) => `
        <li class="records-row">
            <span class="records-rank">${index + 1}.</span>
            <span class="records-period-label">${escapeRecordHtml(record.label)}</span>
            <strong class="records-value">${escapeRecordHtml(valueFormatter(record))}</strong>
        </li>`).join('')}</ol>`;
}

function renderDailyRecordCards(records, granularity) {
    const grid = document.getElementById('records-grid');
    const summaries = groupRecordsByPeriod(records, granularity);

    grid.innerHTML = RECORD_METRICS.map(metric => {
        const topRecords = getTopRecordPeriods(summaries, metric);
        return `<article class="records-card">
            <h3>${metric.title}</h3>
            ${renderRecordRows(topRecords, record => formatRecordValue(record[metric.key], metric.unit))}
        </article>`;
    }).join('');
}

async function fetchHourlyWeatherRecords(cityId, field, direction) {
    const query = new URLSearchParams({
        city_id: `eq.${cityId}`,
        [field]: 'not.is.null',
        select: `forecast_time,${field}`,
        order: `${field}.${direction},forecast_time.desc`,
        limit: '5'
    });
    const response = await fetch(`${API_CONFIG.SUPABASE_URL}/rest/v1/weather_data?${query}`, {
        headers: {
            'apikey': API_CONFIG.SUPABASE_KEY,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

function formatHourlyRecord(record, field) {
    const date = new Date(record.forecast_time);
    return {
        label: `${date.toLocaleDateString('pl-PL')}, ${String(date.getHours()).padStart(2, '0')}:00`,
        value: Number(record[field])
    };
}

function renderHourlyRecordCards(results) {
    const definitions = [
        { title: 'Najwyższe pomiary temperatury', field: 'temperature_2m', unit: 'temperature' },
        { title: 'Najniższe pomiary temperatury', field: 'temperature_2m', unit: 'temperature' },
        { title: 'Największe opady', field: 'precipitation_6h', unit: 'precipitation' },
        { title: 'Najmniejsze opady', field: 'precipitation_6h', unit: 'precipitation' },
        { title: 'Najsilniejszy wiatr', field: 'wind_speed_10m', unit: 'wind' },
        { title: 'Najsłabszy wiatr', field: 'wind_speed_10m', unit: 'wind' },
        { title: 'Największe zachmurzenie', field: 'cloud_cover_total', unit: 'cloud' },
        { title: 'Najmniejsze zachmurzenie', field: 'cloud_cover_total', unit: 'cloud' }
    ];
    const cards = definitions.map((definition, index) => ({
        ...definition,
        records: results[index]
    }));
    document.getElementById('records-grid').innerHTML = cards.map(card => {
        const records = card.records.map(record => formatHourlyRecord(record, card.field));
        return `<article class="records-card">
            <h3>${card.title}</h3>
            ${renderRecordRows(records, record => formatRecordValue(record.value, card.unit))}
        </article>`;
    }).join('');
}

const STREAK_CATEGORIES = [
    {
        id: 'no-precip',
        title: '☀️ Najdłuższe serie bez opadów',
        predicate: r => r.precipitation_sum !== null && r.precipitation_sum !== undefined && Number(r.precipitation_sum) === 0
    },
    {
        id: 'precip',
        title: '🌧️ Najdłuższe serie z opadami',
        predicate: r => r.precipitation_sum !== null && r.precipitation_sum !== undefined && Number(r.precipitation_sum) > 0
    },
    {
        id: 'hot-days',
        title: '🔥 Dni pod rząd > 30°C (upalne)',
        predicate: r => r.temp_max !== null && r.temp_max !== undefined && Number(r.temp_max) > 30
    },
    {
        id: 'warm-days',
        title: '🌡️ Dni pod rząd >= 20°C (ciepłe)',
        predicate: r => r.temp_max !== null && r.temp_max !== undefined && Number(r.temp_max) >= 20
    },
    {
        id: 'frosty-days',
        title: '🧊 Dni mroźne pod rząd (T.Min < 0°C)',
        predicate: r => r.temp_min !== null && r.temp_min !== undefined && Number(r.temp_min) < 0
    },
    {
        id: 'very-cold-days',
        title: '❄️ Dni bardzo mroźne pod rząd (T.Min < -10°C)',
        predicate: r => r.temp_min !== null && r.temp_min !== undefined && Number(r.temp_min) < -10
    },
    {
        id: 'tropical-nights',
        title: '🌙 Noce tropikalne pod rząd (T.Min >= 20°C)',
        predicate: r => r.temp_min !== null && r.temp_min !== undefined && Number(r.temp_min) >= 20
    },
    {
        id: 'strong-wind',
        title: '💨 Dni pod rząd z wiatrem > 10 m/s',
        predicate: r => (r.wind_speed_avg !== null && r.wind_speed_avg !== undefined && Number(r.wind_speed_avg) > 10) ||
                     (r.wind_speed_max !== null && r.wind_speed_max !== undefined && Number(r.wind_speed_max) > 10)
    },
    {
        id: 'calm-wind',
        title: '🍃 Dni pod rząd z wiatrem < 2 m/s',
        predicate: r => r.wind_speed_avg !== null && r.wind_speed_avg !== undefined && Number(r.wind_speed_avg) < 2
    },
    {
        id: 'cloud-100',
        title: '☁️ Dni pod rząd z zachmurzeniem 100%',
        predicate: r => r.cloud_cover_avg !== null && r.cloud_cover_avg !== undefined && Number(r.cloud_cover_avg) >= 95
    },
    {
        id: 'cloud-0',
        title: '☀️ Dni pod rząd bez zachmurzenia',
        predicate: r => r.cloud_cover_avg !== null && r.cloud_cover_avg !== undefined && Number(r.cloud_cover_avg) <= 5
    }
];

function formatStreakDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function calculateStreaksForCategory(records, predicate, limit = 5) {
    const streaks = [];
    let count = 0;
    let startDate = null;
    let endDate = null;

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (predicate(record)) {
            if (count === 0) {
                startDate = record.date;
            }
            count++;
            endDate = record.date;
        } else {
            if (count > 0) {
                streaks.push({ count, startDate, endDate });
                count = 0;
                startDate = null;
                endDate = null;
            }
        }
    }

    if (count > 0) {
        streaks.push({ count, startDate, endDate });
    }

    streaks.sort((a, b) => b.count - a.count || b.endDate.localeCompare(a.endDate));
    return streaks.slice(0, limit);
}

function renderStreakCards(records) {
    const grid = document.getElementById('records-grid');
    if (!grid) return;

    grid.innerHTML = STREAK_CATEGORIES.map(category => {
        const topStreaks = calculateStreaksForCategory(records, category.predicate, 5);

        let rowsHtml = '';
        if (topStreaks.length === 0) {
            rowsHtml = '<div class="records-empty">Brak takich serii w historii pomiarów</div>';
        } else {
            rowsHtml = `<ol class="records-list">${topStreaks.map((streak, index) => {
                const daysLabel = streak.count === 1 ? '1 dzień' : `${streak.count} dni`;
                const dateRange = streak.startDate === streak.endDate
                    ? formatStreakDate(streak.startDate)
                    : `${formatStreakDate(streak.startDate)} – ${formatStreakDate(streak.endDate)}`;

                return `
                    <li class="records-row">
                        <span class="records-rank">${index + 1}.</span>
                        <span class="records-period-label">${dateRange}</span>
                        <strong class="records-value">${daysLabel}</strong>
                    </li>
                `;
            }).join('')}</ol>`;
        }

        return `
            <article class="records-card">
                <h3>${category.title}</h3>
                ${rowsHtml}
            </article>
        `;
    }).join('');
}

function setRecordsStatus(message) {
    const status = document.getElementById('records-status');
    status.textContent = message;
    status.classList.toggle('hidden', !message);
}

async function loadRecordsTab(force = false) {
    const select = document.getElementById('records-location-select');
    if (!select?.value) {
        setRecordsStatus('Wybierz lokalizację');
        document.getElementById('records-grid').innerHTML = '';
        return;
    }

    const location = JSON.parse(select.value);
    const requestId = ++recordsState.requestId;
    setRecordsStatus('Ładowanie rekordów...');
    document.getElementById('records-grid').innerHTML = '';

    try {
        if (recordsState.granularity === 'streaks') {
            const canReuseProfileData = typeof currentDailyCityId !== 'undefined'
                && currentDailyCityId === location.city_id
                && typeof loadedDailyStatsData !== 'undefined'
                && Array.isArray(loadedDailyStatsData);

            if (force || recordsState.cityId !== location.city_id || !recordsState.dailyStats) {
                recordsState.dailyStats = canReuseProfileData
                    ? loadedDailyStatsData
                    : await getAllDailyStats(location.city_id);
                recordsState.cityId = location.city_id;
            }
            if (requestId !== recordsState.requestId) return;
            renderStreakCards(recordsState.dailyStats);
        } else if (recordsState.granularity === 'hour') {
            const hourlyMetrics = [
                ['temperature_2m', 'desc'],
                ['temperature_2m', 'asc'],
                ['precipitation_6h', 'desc'],
                ['precipitation_6h', 'asc'],
                ['wind_speed_10m', 'desc'],
                ['wind_speed_10m', 'asc'],
                ['cloud_cover_total', 'desc'],
                ['cloud_cover_total', 'asc']
            ];
            const results = await Promise.all(hourlyMetrics.map(([field, direction]) =>
                fetchHourlyWeatherRecords(location.city_id, field, direction)
            ));
            if (requestId !== recordsState.requestId) return;
            renderHourlyRecordCards(results);
        } else {
            const canReuseProfileData = typeof currentDailyCityId !== 'undefined'
                && currentDailyCityId === location.city_id
                && typeof loadedDailyStatsData !== 'undefined'
                && Array.isArray(loadedDailyStatsData);

            if (force || recordsState.cityId !== location.city_id || !recordsState.dailyStats) {
                recordsState.dailyStats = canReuseProfileData
                    ? loadedDailyStatsData
                    : await getAllDailyStats(location.city_id);
                recordsState.cityId = location.city_id;
            }
            if (requestId !== recordsState.requestId) return;
            renderDailyRecordCards(recordsState.dailyStats, recordsState.granularity);
        }
        setRecordsStatus('');
    } catch (error) {
        if (requestId !== recordsState.requestId) return;
        setRecordsStatus(`Nie udało się załadować rekordów: ${error.message}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.records-period-btn').forEach(button => {
        button.addEventListener('click', () => {
            recordsState.granularity = button.dataset.period;
            document.querySelectorAll('.records-period-btn').forEach(periodButton => {
                const active = periodButton === button;
                periodButton.classList.toggle('active', active);
                periodButton.setAttribute('aria-pressed', String(active));
            });
            loadRecordsTab();
        });
    });

    document.getElementById('records-location-select')?.addEventListener('change', () => {
        recordsState.cityId = null;
        recordsState.dailyStats = null;
        if (document.getElementById('tab-records')?.classList.contains('active')) {
            loadRecordsTab(true);
        }
    });
});
