/**
 * Wieloletnie srednie dla kolejnych dni wybranego miesiaca.
 */

const MONTHLY_CHART_METRICS = {
    temp_avg: { label: 'Temperatura średnia', unit: '°C', color: '#dc2626', beginAtZero: false },
    temp_max: { label: 'Temperatura maksymalna', unit: '°C', color: '#b91c1c', beginAtZero: false },
    temp_min: { label: 'Temperatura minimalna', unit: '°C', color: '#2563eb', beginAtZero: false },
    wind_speed_avg: { label: 'Prędkość wiatru', unit: 'm/s', color: '#0f766e', beginAtZero: true },
    precipitation_sum: { label: 'Opady', unit: 'mm', color: '#0284c7', beginAtZero: true },
    cloud_cover_avg: { label: 'Zachmurzenie', unit: '%', color: '#64748b', beginAtZero: true }
};

const MONTHLY_CHART_MONTH_NAMES = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'
];

const MONTHLY_CHART_PERIODS = [
    { label: '1950-1989', startYear: 1950, endYear: 1989, color: '#2563eb' },
    { label: '1990-2026', startYear: 1990, endYear: 2026, color: '#dc2626' }
];

const MONTHLY_CHART_DECADE_COLORS = ['#2563eb', '#dc2626', '#0f766e'];

const monthlyChartState = {
    cityId: null,
    records: null,
    chart: null,
    requestId: 0
};

function getMonthlyDailyAverages(records, month, field, startYear = null, endYear = null) {
    const daysInMonth = new Date(2000, month, 0).getDate();
    const valuesByDay = Array.from({ length: daysInMonth }, () => []);

    records.forEach(record => {
        if (!record.date) return;
        const parts = record.date.split('-').map(Number);
        if (parts[1] !== month) return;
        if (startYear !== null && parts[0] < startYear) return;
        if (endYear !== null && parts[0] > endYear) return;
        if (record[field] === null || record[field] === undefined || record[field] === '') return;
        const value = Number(record[field]);
        if (!Number.isFinite(value)) return;
        valuesByDay[parts[2] - 1].push(value);
    });

    return valuesByDay.map((values, index) => ({
        day: index + 1,
        value: values.length > 0
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null,
        samples: values.length
    }));
}

function formatMonthlyYearsCount(count) {
    if (count === 1) return '1 rok';
    const lastTwoDigits = count % 100;
    const lastDigit = count % 10;
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
        return `${count} lata`;
    }
    return `${count} lat`;
}

function getMonthlyChartPeriods(mode, selectedDecades = []) {
    if (mode === 'periods') return MONTHLY_CHART_PERIODS;
    if (mode === 'decades') {
        return selectedDecades.slice(0, 3).map((decade, index) => ({
            label: `${decade}-${Math.min(decade + 9, 2026)}`,
            startYear: decade,
            endYear: Math.min(decade + 9, 2026),
            color: MONTHLY_CHART_DECADE_COLORS[index]
        }));
    }
    return [{ label: '1950-2026', startYear: 1950, endYear: 2026, color: null }];
}

function getMonthlyChartMode() {
    if (document.getElementById('monthly-decades-comparison')?.checked) return 'decades';
    if (document.getElementById('monthly-period-comparison')?.checked) return 'periods';
    return 'all';
}

function getSelectedMonthlyDecades() {
    return Array.from(document.querySelectorAll('#monthly-decades-list input:checked'))
        .map(input => Number(input.value))
        .sort((a, b) => a - b);
}

function updateMonthlyDecadeLimit() {
    const inputs = Array.from(document.querySelectorAll('#monthly-decades-list input'));
    const selectedCount = inputs.filter(input => input.checked).length;
    inputs.forEach(input => {
        input.disabled = !input.checked && selectedCount >= 3;
    });
}

function setupMonthlyDecadeOptions(records) {
    const list = document.getElementById('monthly-decades-list');
    if (!list) return;

    const existingSelection = new Set(getSelectedMonthlyDecades());
    const hasExistingOptions = list.children.length > 0;
    const decades = [...new Set(records
        .map(record => Number(record.date?.slice(0, 4)))
        .filter(year => Number.isFinite(year) && year >= 1950 && year <= 2026)
        .map(year => Math.floor(year / 10) * 10)
    )].sort((a, b) => a - b);
    const defaultSelection = new Set(decades.slice(-3));
    const preservedSelection = new Set(decades.filter(decade => existingSelection.has(decade)));
    const selected = hasExistingOptions && preservedSelection.size > 0
        ? preservedSelection
        : defaultSelection;

    list.innerHTML = '';
    decades.forEach(decade => {
        const label = document.createElement('label');
        label.className = 'monthly-decade-option';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = String(decade);
        input.checked = selected.has(decade);
        input.addEventListener('change', () => {
            if (getSelectedMonthlyDecades().length === 0) input.checked = true;
            updateMonthlyDecadeLimit();
            loadMonthlyChartTab();
        });
        const text = document.createElement('span');
        text.textContent = `${decade}-${Math.min(decade + 9, 2026)}`;
        label.append(input, text);
        list.appendChild(label);
    });
    updateMonthlyDecadeLimit();
}

function updateMonthlyComparisonControls() {
    const decadesEnabled = document.getElementById('monthly-decades-comparison')?.checked ?? false;
    document.getElementById('monthly-decades-container')?.classList.toggle('hidden', !decadesEnabled);
}

function renderMonthlyAveragesChart(records, month, field) {
    const metric = MONTHLY_CHART_METRICS[field];
    const mode = getMonthlyChartMode();
    const periods = getMonthlyChartPeriods(mode, getSelectedMonthlyDecades());
    const periodAverages = periods.map(period => ({
        ...period,
        dailyAverages: getMonthlyDailyAverages(records, month, field, period.startYear, period.endYear)
    }));
    const canvas = document.getElementById('monthly-averages-chart');
    if (!canvas) return;

    if (monthlyChartState.chart) monthlyChartState.chart.destroy();
    monthlyChartState.chart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: periodAverages[0].dailyAverages.map(item => String(item.day)),
            datasets: periodAverages.map(period => ({
                label: period.label,
                data: period.dailyAverages.map(item => item.value),
                backgroundColor: period.color || metric.color,
                borderColor: period.color || metric.color,
                borderWidth: 1,
                borderRadius: 2,
                maxBarThickness: 32
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: periodAverages.length > 1,
                    position: 'top',
                    labels: { usePointStyle: true, pointStyle: 'rect' }
                },
                tooltip: {
                    callbacks: {
                        title: items => `${items[0].label} ${MONTHLY_CHART_MONTH_NAMES[month - 1]}`,
                        label: context => {
                            const period = periodAverages[context.datasetIndex];
                            const item = period.dailyAverages[context.dataIndex];
                            if (item.value === null) return `${period.label}: brak danych`;
                            return `${period.label}: ${item.value.toFixed(1)} ${metric.unit}`;
                        },
                        afterLabel: context => {
                            const period = periodAverages[context.datasetIndex];
                            const samples = period.dailyAverages[context.dataIndex].samples;
                            return `Liczba lat: ${samples}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Dzień miesiąca' },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: metric.beginAtZero,
                    title: { display: true, text: `${metric.label} (${metric.unit})` }
                }
            }
        }
    });

    const periodYearCounts = periods.map(period => new Set(records
        .filter(record => Number(record.date?.slice(5, 7)) === month)
        .filter(record => record[field] !== null && record[field] !== undefined && record[field] !== '')
        .filter(record => Number.isFinite(Number(record[field])))
        .map(record => Number(record.date.slice(0, 4)))
        .filter(year => year >= period.startYear && year <= period.endYear)
    ).size);
    const status = document.getElementById('monthly-chart-status');
    status.textContent = periodYearCounts.every(count => count === 0)
        ? 'Brak danych dla wybranego miesiąca'
        : periodAverages.length === 1
            ? `Średnia z ${formatMonthlyYearsCount(periodYearCounts[0])} (${periods[0].label})`
            : `Porównanie: ${periods.map((period, index) => `${period.label} (${formatMonthlyYearsCount(periodYearCounts[index])})`).join(', ')}`;
}

async function loadMonthlyChartTab(force = false) {
    const locationSelect = document.getElementById('monthly-location-select');
    const status = document.getElementById('monthly-chart-status');
    if (!locationSelect?.value) {
        status.textContent = 'Wybierz lokalizację';
        return;
    }

    const location = JSON.parse(locationSelect.value);
    const month = Number(document.getElementById('monthly-month-select').value);
    const field = document.getElementById('monthly-measure-select').value;
    const requestId = ++monthlyChartState.requestId;
    status.textContent = 'Ładowanie danych...';

    try {
        const canReuseProfileData = typeof currentDailyCityId !== 'undefined'
            && currentDailyCityId === location.city_id
            && typeof loadedDailyStatsData !== 'undefined'
            && Array.isArray(loadedDailyStatsData);

        if (force || monthlyChartState.cityId !== location.city_id || !monthlyChartState.records) {
            monthlyChartState.records = canReuseProfileData
                ? loadedDailyStatsData
                : await getAllDailyStats(location.city_id);
            monthlyChartState.cityId = location.city_id;
        }
        if (requestId !== monthlyChartState.requestId) return;
        setupMonthlyDecadeOptions(monthlyChartState.records);
        renderMonthlyAveragesChart(monthlyChartState.records, month, field);
    } catch (error) {
        if (requestId !== monthlyChartState.requestId) return;
        status.textContent = `Nie udało się załadować wykresu: ${error.message}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const monthSelect = document.getElementById('monthly-month-select');
    if (monthSelect) monthSelect.value = String(new Date().getMonth() + 1);

    document.getElementById('monthly-location-select')?.addEventListener('change', () => {
        monthlyChartState.cityId = null;
        monthlyChartState.records = null;
        loadMonthlyChartTab(true);
    });
    monthSelect?.addEventListener('change', () => loadMonthlyChartTab());
    document.getElementById('monthly-measure-select')?.addEventListener('change', () => loadMonthlyChartTab());

    const periodComparison = document.getElementById('monthly-period-comparison');
    const decadesComparison = document.getElementById('monthly-decades-comparison');
    periodComparison?.addEventListener('change', () => {
        if (periodComparison.checked && decadesComparison) decadesComparison.checked = false;
        updateMonthlyComparisonControls();
        loadMonthlyChartTab();
    });
    decadesComparison?.addEventListener('change', () => {
        if (decadesComparison.checked && periodComparison) periodComparison.checked = false;
        updateMonthlyComparisonControls();
        loadMonthlyChartTab();
    });
    updateMonthlyComparisonControls();
});
