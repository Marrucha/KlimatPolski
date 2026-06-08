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
