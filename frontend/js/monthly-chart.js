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

function renderMonthlyAveragesChart(records, month, field) {
    const metric = MONTHLY_CHART_METRICS[field];
    const periodAverages = MONTHLY_CHART_PERIODS.map(period => ({
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
                backgroundColor: period.color,
                borderColor: period.color,
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
                    display: true,
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

    const periodYearCounts = MONTHLY_CHART_PERIODS.map(period => new Set(records
        .filter(record => Number(record.date?.slice(5, 7)) === month)
        .filter(record => record[field] !== null && record[field] !== undefined && record[field] !== '')
        .filter(record => Number.isFinite(Number(record[field])))
        .map(record => Number(record.date.slice(0, 4)))
        .filter(year => year >= period.startYear && year <= period.endYear)
    ).size);
    const status = document.getElementById('monthly-chart-status');
    status.textContent = periodYearCounts.every(count => count === 0)
        ? 'Brak danych dla wybranego miesiąca'
        : `Porównanie: 1950-1989 (${formatMonthlyYearsCount(periodYearCounts[0])}) i 1990-2026 (${formatMonthlyYearsCount(periodYearCounts[1])})`;
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
});
