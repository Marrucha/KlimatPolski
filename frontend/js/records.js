/**
 * Rekordy klimatyczne obliczane z dziennych statystyk i punktowych pomiarow.
 */

const RECORD_METRICS = [
    { key: 'periodAverage', title: 'Najwyższa średnia okresu', direction: 'desc', unit: 'temperature', completedPeriodsOnly: true },
    { key: 'periodMedian', title: 'Najwyższa mediana okresu', direction: 'desc', unit: 'temperature', completedPeriodsOnly: true },
    { key: 'tempMax', title: 'Najwyższa temperatura', direction: 'desc', unit: 'temperature' },
    { key: 'tempMin', title: 'Najniższa temperatura', direction: 'asc', unit: 'temperature' },
    { key: 'tempMaxAvg', title: 'Najwyższa średnia dobowa', direction: 'desc', unit: 'temperature' },
    { key: 'tempMinAvg', title: 'Najniższa średnia dobowa', direction: 'asc', unit: 'temperature' },
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
            label: `tydzień ${iso.week}, ${iso.year}`,
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

async function fetchHourlyTemperatureRecords(cityId, direction) {
    const query = new URLSearchParams({
        city_id: `eq.${cityId}`,
        temperature_2m: 'not.is.null',
        select: 'forecast_time,temperature_2m',
        order: `temperature_2m.${direction},forecast_time.desc`,
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

function formatHourlyRecord(record) {
    const date = new Date(record.forecast_time);
    return {
        label: `${date.toLocaleDateString('pl-PL')}, ${String(date.getHours()).padStart(2, '0')}:00`,
        value: Number(record.temperature_2m)
    };
}

function renderHourlyRecordCards(highest, lowest) {
    const cards = [
        { title: 'Najwyższe pomiary temperatury', records: highest },
        { title: 'Najniższe pomiary temperatury', records: lowest }
    ];
    document.getElementById('records-grid').innerHTML = cards.map(card => {
        const records = card.records.map(formatHourlyRecord);
        return `<article class="records-card">
            <h3>${card.title}</h3>
            ${renderRecordRows(records, record => `${record.value.toFixed(1)}°C`)}
        </article>`;
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
        if (recordsState.granularity === 'hour') {
            const [highest, lowest] = await Promise.all([
                fetchHourlyTemperatureRecords(location.city_id, 'desc'),
                fetchHourlyTemperatureRecords(location.city_id, 'asc')
            ]);
            if (requestId !== recordsState.requestId) return;
            renderHourlyRecordCards(highest, lowest);
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
