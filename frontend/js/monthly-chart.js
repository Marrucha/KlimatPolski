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

const MONTHLY_DELTA_LABELS_PLUGIN = {
    id: 'monthlyDeltaLabels',
    afterDatasetsDraw(chart) {
        const datasetIndex = chart.data.datasets.findIndex(dataset => dataset.isDelta);
        if (datasetIndex < 0) return;
        const dataset = chart.data.datasets[datasetIndex];
        const points = chart.getDatasetMeta(datasetIndex).data;
        const ctx = chart.ctx;

        ctx.save();
        ctx.font = '700 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        dataset.data.forEach((value, index) => {
            if (value === null || !points[index]) return;
            const sign = value > 0 ? '+' : '';
            ctx.fillText(`${sign}${value.toFixed(1)}`, points[index].x, points[index].y);
        });
        ctx.restore();
    }
};

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

function getMonthlyDeltaValues(firstGroup, secondGroup) {
    return firstGroup.map((first, index) => {
        const second = secondGroup[index];
        if (first.value === null || second?.value === null || second === undefined) return null;
        return second.value - first.value;
    });
}

function getMonthlyValuesAverage(values) {
    const validValues = values.filter(value => Number.isFinite(value));
    return validValues.length > 0
        ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
        : null;
}

function renderMonthlyPeriodAverageCards(periodAverages, metric, deltaValues = null) {
    const container = document.getElementById('monthly-period-averages');
    if (!container) return;

    const isPrecip = metric.label.toLowerCase().includes('opad') || metric.label === 'Opady';

    const cards = periodAverages.map(period => {
        const values = period.dailyAverages.map(item => item.value).filter(v => Number.isFinite(v));
        const val = isPrecip 
            ? (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null)
            : getMonthlyValuesAverage(values);
        return {
            label: `${isPrecip ? 'Suma' : 'Średnia'} ${period.label}`,
            color: period.color || metric.color,
            value: val
        };
    });

    if (deltaValues) {
        const validDeltas = deltaValues.filter(v => Number.isFinite(v));
        const deltaVal = isPrecip
            ? (validDeltas.length > 0 ? validDeltas.reduce((sum, value) => sum + value, 0) : null)
            : getMonthlyValuesAverage(deltaValues);
        cards.push({
            label: `Delta ${isPrecip ? 'sum' : 'średnich'} (${periodAverages[1].label} - ${periodAverages[0].label})`,
            color: '#111827',
            value: deltaVal
        });
    }

    container.innerHTML = cards.map(card => `
        <div class="monthly-average-card" style="--monthly-series-color: ${card.color}">
            <span class="monthly-average-label">${card.label}</span>
            <strong class="monthly-average-value">${card.value === null ? '--' : `${card.value.toFixed(1)} ${metric.unit}`}</strong>
        </div>
    `).join('');
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
    updateMonthlyDeltaControl();
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
    updateMonthlyDeltaControl();
}

function updateMonthlyDeltaControl() {
    const deltaToggle = document.getElementById('monthly-show-delta');
    if (!deltaToggle) return;
    const periods = getMonthlyChartPeriods(getMonthlyChartMode(), getSelectedMonthlyDecades());
    const enabled = periods.length === 2;
    deltaToggle.disabled = !enabled;
    if (!enabled) deltaToggle.checked = false;
}

function renderMonthlyAveragesChart(records, month, field) {
    const metric = MONTHLY_CHART_METRICS[field];
    const mode = getMonthlyChartMode();
    const periods = getMonthlyChartPeriods(mode, getSelectedMonthlyDecades());
    const periodAverages = periods.map(period => ({
        ...period,
        dailyAverages: getMonthlyDailyAverages(records, month, field, period.startYear, period.endYear)
    }));
    const showDelta = periodAverages.length === 2
        && (document.getElementById('monthly-show-delta')?.checked ?? false);
    const datasets = periodAverages.map(period => ({
        label: period.label,
        data: period.dailyAverages.map(item => item.value),
        backgroundColor: period.color || metric.color,
        borderColor: period.color || metric.color,
        borderWidth: 1,
        borderRadius: 2,
        maxBarThickness: 32,
        yAxisID: 'y',
        order: 2
    }));
    let deltaValues = null;
    if (showDelta) {
        deltaValues = getMonthlyDeltaValues(
            periodAverages[0].dailyAverages,
            periodAverages[1].dailyAverages
        );
        const deltaPointColors = deltaValues.map(value => {
            if (value === null || value === 0) return '#475569';
            return value > 0 ? periods[1].color : periods[0].color;
        });
        datasets.push({
            type: 'line',
            label: `Delta (${periods[1].label} - ${periods[0].label})`,
            data: deltaValues,
            borderColor: '#111827',
            backgroundColor: '#111827',
            borderWidth: 2,
            pointBackgroundColor: deltaPointColors,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            pointRadius: 11,
            pointHoverRadius: 13,
            pointHitRadius: 4,
            tension: 0.15,
            spanGaps: false,
            isDelta: true,
            yAxisID: 'yDelta',
            order: 1
        });
    }
    renderMonthlyPeriodAverageCards(periodAverages, metric, deltaValues);
    const canvas = document.getElementById('monthly-averages-chart');
    if (!canvas) return;

    if (monthlyChartState.chart) monthlyChartState.chart.destroy();
    monthlyChartState.chart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: periodAverages[0].dailyAverages.map(item => String(item.day)),
            datasets
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
                            if (context.dataset.isDelta) {
                                const value = context.parsed.y;
                                if (value === null) return 'Delta: brak danych';
                                const sign = value > 0 ? '+' : '';
                                return `Delta: ${sign}${value.toFixed(1)} ${metric.unit}`;
                            }
                            const period = periodAverages[context.datasetIndex];
                            const item = period.dailyAverages[context.dataIndex];
                            if (item.value === null) return `${period.label}: brak danych`;
                            return `${period.label}: ${item.value.toFixed(1)} ${metric.unit}`;
                        },
                        afterLabel: context => {
                            if (context.dataset.isDelta) return 'Druga grupa minus pierwsza';
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
                },
                yDelta: {
                    display: showDelta,
                    position: 'right',
                    beginAtZero: false,
                    grace: '10%',
                    grid: { drawOnChartArea: false },
                    title: { display: showDelta, text: `Delta (${metric.unit})` }
                }
            }
        },
        plugins: [MONTHLY_DELTA_LABELS_PLUGIN]
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
            ? `${isPrecip ? 'Suma' : 'Średnia'} z ${formatMonthlyYearsCount(periodYearCounts[0])} (${periods[0].label})`
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
    const averagesContainer = document.getElementById('monthly-period-averages');
    if (averagesContainer) averagesContainer.innerHTML = '';

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
    document.getElementById('monthly-show-delta')?.addEventListener('change', () => loadMonthlyChartTab());

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
