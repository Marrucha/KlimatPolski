/**
 * Wykresy - wizualizacja danych pogodowych (vanilla canvas)
 */

/**
 * Rysuje prosty histogram dla wartości temperatury
 * @param {string} containerId - ID kontenera
 * @param {Array<number>} temperatures - tablica temperatur
 */
function drawTemperatureChart(containerId, temperatures) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = 200;
    container.innerHTML = '';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!temperatures || temperatures.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px sans-serif';
        ctx.fillText('Brak danych', 10, 100);
        return;
    }

    // Parametry wykresu
    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    const barWidth = Math.max(2, chartWidth / temperatures.length);

    const minTemp = Math.min(...temperatures);
    const maxTemp = Math.max(...temperatures);
    const tempRange = maxTemp - minTemp || 1;

    // Rysuj osie
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Rysuj słupki
    ctx.fillStyle = '#3b82f6';
    temperatures.forEach((temp, idx) => {
        const normalizedTemp = (temp - minTemp) / tempRange;
        const barHeight = normalizedTemp * chartHeight;
        const x = padding + idx * barWidth;
        const y = canvas.height - padding - barHeight;

        ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });

    // Etykiety
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Min: ${minTemp.toFixed(1)}°C`, padding + 5, padding - 10);
    ctx.textAlign = 'right';
    ctx.fillText(`Max: ${maxTemp.toFixed(1)}°C`, canvas.width - padding - 5, padding - 10);
}

/**
 * Rysuje wykres liniowy dla opadów
 * @param {string} containerId - ID kontenera
 * @param {Array<number>} precipitation - tablica wartości opadów
 */
function drawPrecipitationChart(containerId, precipitation) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = 200;
    container.innerHTML = '';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!precipitation || precipitation.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px sans-serif';
        ctx.fillText('Brak danych', 10, 100);
        return;
    }

    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    const maxPrecip = Math.max(...precipitation);
    const precipRange = maxPrecip || 1;

    // Osie
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Słupki opadów
    ctx.fillStyle = '#0ea5e9';
    precipitation.forEach((precip, idx) => {
        const normalized = precip / precipRange;
        const barHeight = normalized * chartHeight;
        const x = padding + (idx / precipitation.length) * chartWidth;
        const barWidth = Math.max(1, chartWidth / precipitation.length - 2);
        const y = canvas.height - padding - barHeight;

        ctx.fillRect(x, y, barWidth, barHeight);
    });

    // Etykieta
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Max: ${maxPrecip.toFixed(1)} mm`, canvas.width - padding - 5, padding - 10);
}

/**
 * Rysuje diagram wiatru (róża wiatrów)
 * @param {string} containerId - ID kontenera
 * @param {Array<number>} windSpeeds - tablica prędkości wiatru
 * @param {Array<number>} windDirections - tablica kierunków wiatru
 */
function drawWindChart(containerId, windSpeeds, windDirections) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = 200;
    container.innerHTML = '';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!windSpeeds || windSpeeds.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px sans-serif';
        ctx.fillText('Brak danych', 10, 100);
        return;
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 2 - 30;

    const maxSpeed = Math.max(...windSpeeds);
    const speedRange = maxSpeed || 1;

    // Rysuj kompas
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Kierunki kardynalne
    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', centerX, centerY - radius - 10);
    ctx.fillText('S', centerX, centerY + radius + 20);
    ctx.textAlign = 'right';
    ctx.fillText('E', centerX + radius + 10, centerY);
    ctx.textAlign = 'left';
    ctx.fillText('W', centerX - radius - 10, centerY);

    // Rysuj wektory wiatru
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    windSpeeds.forEach((speed, idx) => {
        const dir = windDirections[idx] || 0;
        const normalized = speed / speedRange;
        const lineLength = normalized * radius;

        // Konwersja kierunku: 0° = północ
        const radians = (dir - 90) * Math.PI / 180;
        const x = centerX + lineLength * Math.cos(radians);
        const y = centerY + lineLength * Math.sin(radians);

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
    });

    // Etykieta
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Max: ${maxSpeed.toFixed(1)} m/s`, canvas.width - 10, 20);
}

/**
 * Rysuje okrąg dla zachmurzenia
 * @param {string} containerId - ID kontenera
 * @param {number} cloudCover - średnie zachmurzenie (0-100%)
 */
function drawCloudChart(containerId, cloudCover) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = 200;
    container.innerHTML = '';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (cloudCover === undefined || cloudCover === null) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px sans-serif';
        ctx.fillText('Brak danych', 10, 100);
        return;
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 60;

    const cloudPercent = Math.min(100, Math.max(0, cloudCover));

    // Rysuj tło (pełny okrąg)
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Rysuj zachmurzenie (procesor okrągu)
    ctx.fillStyle = '#94a3b8';
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (cloudPercent / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.lineTo(centerX, centerY);
    ctx.fill();

    // Procent tekstu
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${cloudPercent.toFixed(0)}%`, centerX, centerY);
}

/**
 * Rysuje wykres porównania lat (Climate Reanalyzer) przy użyciu Chart.js
 * @param {string} canvasId - ID elementu canvas
 * @param {Array<Object>} stats - dane z daily_stats
 * @param {string} measure - wybrana miara (np. temp_avg)
 * @param {Object} config - konfiguracja (highlightedYears, showNorms, showHistoricalBg)
 */
function drawYearlyComparisonChart(canvasId, stats, measure, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Zniszcz poprzedni wykres jeśli istnieje
    if (window.yearlyComparisonChartInstance) {
        window.yearlyComparisonChartInstance.destroy();
    }

    if (!stats || stats.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Brak danych dla wybranej lokalizacji. Załaduj profil.', canvas.width / 2, canvas.height / 2);
        return;
    }

    // 1. Grupowanie danych po roku i wyliczanie dnia roku (0-365)
    const yearsData = {};
    const availableYears = new Set();

    stats.forEach(item => {
        const date = new Date(item.date);
        const year = date.getFullYear();
        availableYears.add(year);

        // Oblicz dzień roku (0-365)
        const start = new Date(year, 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay) - 1;

        if (!yearsData[year]) {
            yearsData[year] = new Array(366).fill(null);
        }

        if (dayOfYear >= 0 && dayOfYear < 366) {
            yearsData[year][dayOfYear] = item[measure] !== undefined ? parseFloat(item[measure]) : null;
        }
    });

    // Zapisz dostępne lata do globalnego stanu (filtrujemy parzyste jeśli zaznaczono)
    let yearsList = Array.from(availableYears).sort((a, b) => b - a);
    if (config.onlyEvenYears) {
        yearsList = yearsList.filter(y => y % 2 === 0);
    }
    window.loadedAvailableYears = yearsList;

    // 2. Generowanie etykiet (dni roku)
    const labels = Array.from({ length: 366 }, (_, i) => i + 1);

    // 3. Przygotowanie serii danych (datasets)
    const datasets = [];

    // Predefiniowane kolory dla wyróżnionych lat lub dekad
    const colorsPalette = {
        2026: '#dc2626', // Czerwony
        2025: '#ea580c', // Pomarańczowy
        2024: '#2563eb', // Niebieski
        2023: '#16a34a', // Zielony
        2022: '#8b5cf6', // Fioletowy
        2021: '#ec4899', // Różowy
        2020: '#06b6d4', // Turkusowy
        
        // Dekady
        "2020s": '#dc2626',
        "2010s": '#ea580c',
        "2000s": '#d97706',
        "1990s": '#16a34a',
        "1980s": '#2563eb',
        "1970s": '#4f46e5',
        "1960s": '#9333ea',
        "1950s": '#db2777'
    };

    const defaultColor = (idx) => {
        const colors = ['#f43f5e', '#a855f7', '#10b981', '#eab308', '#3b82f6'];
        return colors[idx % colors.length];
    };

    // Filtrujemy lata na podstawie wyboru "Tylko parzyste"
    const yearsToProcess = Object.keys(yearsData).map(Number).filter(year => {
        if (config.onlyEvenYears) {
            return year % 2 === 0;
        }
        return true;
    });

    // Definiujemy funkcję agregacji w zależności od wybranej miary (średnia / min / max)
    let aggregateFn = (values) => values.reduce((a, b) => a + b) / values.length;
    let refLabelType = 'Średnia';

    if (measure.includes('max')) {
        aggregateFn = (values) => Math.max(...values);
        refLabelType = 'Maksimum';
    } else if (measure.includes('min')) {
        aggregateFn = (values) => Math.min(...values);
        refLabelType = 'Minimum';
    }



    if (config.showDecades) {
        // --- TRYB DEKAD ---
        const decades = {};
        yearsToProcess.forEach(year => {
            if (year === 2026) return; // Pomijamy niepełny rok 2026 w średnich dekadowych
            const decadeStart = Math.floor(year / 10) * 10;
            const decadeName = `${decadeStart}s`; // np. "2020s"
            if (!decades[decadeName]) decades[decadeName] = [];
            decades[decadeName].push(year);
        });

        const decadeColors = {
            "2020s": '#dc2626', // Czerwony
            "2010s": '#ea580c', // Pomarańczowy
            "2000s": '#d97706', // Żółty/Bursztynowy
            "1990s": '#16a34a', // Zielony
            "1980s": '#2563eb', // Niebieski
            "1970s": '#4f46e5', // Fioletowy
            "1960s": '#9333ea', // Purpurowy
            "1950s": '#db2777'  // Różowy
        };

        Object.keys(decades).sort().forEach(decadeName => {
            // Jeśli zdefiniowano widoczne dekady, filtrujemy
            if (config.visibleDecades && !config.visibleDecades.includes(decadeName)) {
                return;
            }

            const yearsInDecade = decades[decadeName];
            const color = decadeColors[decadeName] || '#6b7280';

            const decadeData = new Array(366).fill(null);

            for (let day = 0; day < 366; day++) {
                const values = [];
                yearsInDecade.forEach(y => {
                    if (yearsData[y] && yearsData[y][day] !== null && yearsData[y][day] !== undefined) {
                        values.push(yearsData[y][day]);
                    }
                });
                if (values.length > 0) {
                    decadeData[day] = aggregateFn(values);
                }
            }

            datasets.push({
                label: `${decadeName} (${refLabelType})`,
                data: decadeData,
                borderColor: color,
                borderWidth: 1.2, // Cieniutka linia dla dekady
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        });

    } else {
        // --- TRYB ZWYKŁY (POJEDYNCZE LATA) ---
        // a. Lata historyczne w tle
        if (config.showHistoricalBg) {
            yearsToProcess.forEach(year => {
                const isHighlighted = config.highlightedYears.includes(year);
                if (!isHighlighted) {
                    datasets.push({
                        label: `${year}`,
                        data: yearsData[year],
                        borderColor: 'rgba(107, 114, 128, 0.35)',
                        borderWidth: 0.4, // Bardzo cieniutkie tło
                        pointRadius: 0,
                        hoverBorderWidth: 1.2,
                        hoverBorderColor: 'rgba(75, 85, 99, 0.6)',
                        fill: false,
                        tension: 0.1
                    });
                }
            });
        }

        // b. Wyróżnione lata (sortowane rosnąco, aby najnowsze lata rysowały się na wierzchu)
        [...config.highlightedYears].sort((a, b) => a - b).forEach((year, idx) => {
            if (yearsData[year]) {
                const color = colorsPalette[year] || defaultColor(idx);
                datasets.push({
                    label: `${year}`,
                    data: yearsData[year],
                    borderColor: color,
                    borderWidth: year === 2026 ? 1.6 : 1.0, // Cieńsze wyróżnienia
                    pointRadius: 0,
                    hoverBorderWidth: 2.5,
                    fill: false,
                    tension: 0.1
                });
            }
        });
    }

    // c. Średnie klimatologiczne (normy) - wyświetlamy zawsze jako referencję
    const calculateNorm = (startYear, endYear) => {
        const norm = new Array(366).fill(null);
        for (let day = 0; day < 366; day++) {
            const values = [];
            for (let y = startYear; y <= endYear; y++) {
                if (yearsData[y] && yearsData[y][day] !== null && yearsData[y][day] !== undefined) {
                    values.push(yearsData[y][day]);
                }
            }
            if (values.length > 0) {
                norm[day] = aggregateFn(values);
            }
        }
        return norm;
    };

    if (config.showNorm1991_2020) {
        const normData = calculateNorm(1991, 2020);
        datasets.push({
            label: `${refLabelType} 1991-2020 (Norma)`,
            data: normData,
            borderColor: '#000000', // Na czarno
            borderWidth: 1.3,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    }

    if (config.showNorm1981_2010) {
        const normData = calculateNorm(1981, 2010);
        datasets.push({
            label: `${refLabelType} 1981-2010`,
            data: normData,
            borderColor: '#374151', // Ciemnoszary/czarny
            borderWidth: 1.0,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    }

    if (config.showNorm1980_2000) {
        const normData = calculateNorm(1980, 2000);
        datasets.push({
            label: `${refLabelType} 1980-2000`,
            data: normData,
            borderColor: '#555555', // Szary
            borderWidth: 1.0,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    }

    if (config.showNorm1960_1990) {
        const normData = calculateNorm(1960, 1990);
        datasets.push({
            label: `${refLabelType} 1960-1990`,
            data: normData,
            borderColor: '#777777', // Jasnoszary
            borderWidth: 1.0,
            borderDash: [2, 3],
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    }

    // Wygładzanie serii (średnia krocząca) - tygodniowe lub miesięczne
    if (config.smoothing === 'week' || config.smoothing === 'month') {
        const windowSize = config.smoothing === 'week' ? 7 : 30;
        const half = Math.floor(windowSize / 2);
        const smoothArray = (arr) => arr.map((_, i) => {
            let sum = 0, count = 0;
            for (let j = i - half; j <= i + half; j++) {
                if (j < 0 || j >= arr.length) continue;
                const v = arr[j];
                if (v !== null && v !== undefined) {
                    sum += v;
                    count++;
                }
            }
            return count > 0 ? sum / count : null;
        });

        datasets.forEach(ds => {
            ds.data = smoothArray(ds.data);
        });
    }

    // Nazwy jednostek i etykiety miar
    const measureInfo = {
        temp_avg: { label: 'Temperatura średnia', unit: '°C' },
        temp_max: { label: 'Temperatura maksymalna', unit: '°C' },
        temp_min: { label: 'Temperatura minimalna', unit: '°C' },
        wind_speed_avg: { label: 'Średnia prędkość wiatru', unit: 'm/s' },
        precipitation_sum: { label: 'Suma opadów', unit: 'mm' },
        cloud_cover_avg: { label: 'Średnie zachmurzenie', unit: '%' }
    };

    const currentInfo = measureInfo[measure] || { label: measure, unit: '' };

    // 4. Budowanie wykresu Chart.js
    window.yearlyComparisonChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 20,
                        font: {
                            size: 11,
                            family: 'Inter, sans-serif'
                        },
                        filter: function(item, chartData) {
                            // Ukryj szare linie tła w legendzie
                            if (config.showDecades) return true;
                            const isHistoryBg = !isNaN(item.text) && !config.highlightedYears.includes(parseInt(item.text));
                            return !isHistoryBg;
                        }
                    }
                },
                tooltip: {
                    enabled: false, // Domyślnie wyłączony (pokazuje się tylko po naciśnięciu prawego przycisku)
                    filter: function(item) {
                        if (config.showDecades) {
                            return config.visibleDecades.includes(item.dataset.label);
                        }
                        const isYear = !isNaN(item.dataset.label);
                        if (isYear) {
                            return config.highlightedYears.includes(parseInt(item.dataset.label));
                        }
                        return true; // Pokaż normy
                    },
                    callbacks: {
                        title: function(context) {
                            if (!context || !context.length) return '';
                            const dayIndex = context[0].dataIndex;
                            const date = new Date(2024, 0, dayIndex + 1);
                            const monthNames = ['Stycznia', 'Lutego', 'Marca', 'Kwietnia', 'Maja', 'Czerwca', 'Lipca', 'Sierpnia', 'Września', 'Października', 'Listopada', 'Grudnia'];
                            return `${date.getDate()} ${monthNames[date.getMonth()]}`;
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (context.parsed.y !== null) {
                                const dayVal = context.parsed.y.toFixed(1) + ' ' + currentInfo.unit;
                                
                                // Wyznaczenie zakresu miesiąca dla danego dnia
                                const dayIndex = context.dataIndex;
                                const monthIdx = new Date(2024, 0, dayIndex + 1).getMonth();
                                const monthRanges = [
                                    { start: 0, end: 30 }, { start: 31, end: 59 }, { start: 60, end: 90 },
                                    { start: 91, end: 120 }, { start: 121, end: 151 }, { start: 152, end: 181 },
                                    { start: 182, end: 212 }, { start: 213, end: 243 }, { start: 244, end: 273 },
                                    { start: 274, end: 304 }, { start: 305, end: 334 }, { start: 335, end: 365 }
                                ];
                                const range = monthRanges[monthIdx];
                                const monthValues = (context.dataset.data || []).slice(range.start, range.end + 1).filter(v => v !== null && v !== undefined);
                                
                                let monthValStr = '--';
                                if (monthValues.length > 0) {
                                    let monthVal = 0;
                                    if (measure.includes('max')) {
                                        monthVal = Math.max(...monthValues);
                                    } else if (measure.includes('min')) {
                                        monthVal = Math.min(...monthValues);
                                    } else if (measure.includes('sum')) {
                                        monthVal = monthValues.reduce((a, b) => a + b, 0);
                                    } else {
                                        monthVal = monthValues.reduce((a, b) => a + b, 0) / monthValues.length;
                                    }
                                    monthValStr = monthVal.toFixed(1) + ' ' + currentInfo.unit;
                                }
                                
                                const nominativeMonths = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
                                const monthName = nominativeMonths[monthIdx];
                                label = `${label}: ${dayVal} | ${monthName}: ${monthValStr}`;
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        font: {
                            family: 'Inter, sans-serif'
                        },
                        callback: function(val, index) {
                            const date = new Date(2024, 0, index + 1);
                            if (date.getDate() === 1) {
                                const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
                                return months[date.getMonth()];
                            }
                            return null;
                        },
                        autoSkip: false
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: `${currentInfo.label} (${currentInfo.unit})`,
                        font: {
                            weight: 'bold',
                            family: 'Inter, sans-serif'
                        }
                    },
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        font: {
                            family: 'Inter, sans-serif'
                        }
                    }
                }
            }
        }
    });

    // 5. Obsługa wyświetlania tooltipu tylko przy wciśniętym prawym przycisku myszy
    canvas.onmousedown = (e) => {
        if (e.button === 2) { // Prawy przycisk myszy
            if (window.yearlyComparisonChartInstance) {
                window.yearlyComparisonChartInstance.options.plugins.tooltip.enabled = true;
                window.yearlyComparisonChartInstance.update('none');
            }
        }
    };
    
    canvas.onmouseup = (e) => {
        if (e.button === 2) {
            if (window.yearlyComparisonChartInstance) {
                window.yearlyComparisonChartInstance.options.plugins.tooltip.enabled = false;
                window.yearlyComparisonChartInstance.update('none');
            }
        }
    };

    canvas.onmouseleave = () => {
        if (window.yearlyComparisonChartInstance) {
            window.yearlyComparisonChartInstance.options.plugins.tooltip.enabled = false;
            window.yearlyComparisonChartInstance.update('none');
        }
    };

    canvas.oncontextmenu = (e) => {
        e.preventDefault(); // Zablokuj menu kontekstowe
    };
}

