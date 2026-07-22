/**
 * Obsługa zakładki "Serie" (najdłuższe ciągi dni spełniających określone warunki pogodowe)
 */

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
        id: 'very-cold-days',
        title: '❄️ Dni pod rząd < -10°C (bardzo mroźne)',
        predicate: r => r.temp_min !== null && r.temp_min !== undefined && Number(r.temp_min) < -10
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

const streaksState = {
    cityId: null,
    dailyStats: null,
    requestId: 0
};

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

    // Sortuj po długości serii (malejąco), a przy tej samej długości - po dacie (najnowsze pierwsze)
    streaks.sort((a, b) => b.count - a.count || b.endDate.localeCompare(a.endDate));

    return streaks.slice(0, limit);
}

function renderStreakCards(records) {
    const grid = document.getElementById('streaks-grid');
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

function setStreaksStatus(message) {
    const status = document.getElementById('streaks-status');
    if (status) {
        status.textContent = message;
        status.classList.toggle('hidden', !message);
    }
}

async function loadStreaksTab(force = false) {
    const select = document.getElementById('streaks-location-select');
    if (!select?.value) {
        setStreaksStatus('Wybierz lokalizację');
        const grid = document.getElementById('streaks-grid');
        if (grid) grid.innerHTML = '';
        return;
    }

    const location = JSON.parse(select.value);
    const requestId = ++streaksState.requestId;
    setStreaksStatus('Obliczanie serii dla wybranych danych...');

    const grid = document.getElementById('streaks-grid');
    if (grid) grid.innerHTML = '';

    try {
        const canReuseProfileData = typeof currentDailyCityId !== 'undefined'
            && currentDailyCityId === location.city_id
            && typeof loadedDailyStatsData !== 'undefined'
            && Array.isArray(loadedDailyStatsData);

        if (force || streaksState.cityId !== location.city_id || !streaksState.dailyStats) {
            streaksState.dailyStats = canReuseProfileData
                ? loadedDailyStatsData
                : await getAllDailyStats(location.city_id);
            streaksState.cityId = location.city_id;
        }

        if (requestId !== streaksState.requestId) return;

        renderStreakCards(streaksState.dailyStats);
        setStreaksStatus('');
    } catch (error) {
        if (requestId !== streaksState.requestId) return;
        setStreaksStatus(`Błąd przy obliczaniu serii: ${error.message}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('streaks-location-select')?.addEventListener('change', () => {
        streaksState.cityId = null;
        streaksState.dailyStats = null;
        if (document.getElementById('tab-streaks')?.classList.contains('active')) {
            loadStreaksTab(true);
        }
    });
});
