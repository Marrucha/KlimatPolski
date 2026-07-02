/**
 * API - Komunikacja z Supabase (dane pogodowe) i Firestore (cache statystyk)
 */

const API_CONFIG = {
    SUPABASE_URL: 'https://mharscyrkgcoanqduqto.supabase.co',
    SUPABASE_KEY: 'sb_publishable_4huZMlzUuCffXcLPyQf4nQ_lFl25wYD',
    FIRESTORE_PROJECT_ID: 'your-project-id'
};

/**
 * Pobiera dostępne lokalizacje z tabeli cities
 */
async function getAvailableLocations() {
    try {
        const response = await fetch(
            `${API_CONFIG.SUPABASE_URL}/rest/v1/cities?select=id,name,latitude,longitude`,
            {
                headers: {
                    'apikey': API_CONFIG.SUPABASE_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return await response.json();
    } catch (error) {
        console.error('Błąd przy pobieraniu lokalizacji:', error);
        return [];
    }
}

/**
 * Pobiera dane pogodowe dla wybranego miasta i okresu
 * @param {number} cityId - ID miasta
 * @param {string} startDate - data początkowa (YYYY-MM-DD)
 * @param {string} endDate - data końcowa (YYYY-MM-DD)
 */
async function getWeatherData(cityId, startDate, endDate) {
    try {
        const query = `city_id=eq.${cityId}&forecast_time=gte.${startDate}T00:00:00Z&forecast_time=lte.${endDate}T23:59:59Z&order=forecast_time.asc`;

        const response = await fetch(
            `${API_CONFIG.SUPABASE_URL}/rest/v1/weather_data?${query}`,
            {
                headers: {
                    'apikey': API_CONFIG.SUPABASE_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return await response.json();
    } catch (error) {
        console.error('Błąd przy pobieraniu danych pogodowych:', error);
        return [];
    }
}

/**
 * Pobiera statystyki dzienne z cache (Firestore lub Supabase)
 * @param {number} cityId - ID miasta
 * @param {string} date - data (YYYY-MM-DD)
 */
async function getDailyStats(cityId, date) {
    try {
        const query = `city_id=eq.${cityId}&date=eq.${date}`;

        const response = await fetch(
            `${API_CONFIG.SUPABASE_URL}/rest/v1/daily_stats?${query}`,
            {
                headers: {
                    'apikey': API_CONFIG.SUPABASE_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error('Błąd przy pobieraniu statystyk dziennych:', error);
        return null;
    }
}

/**
 * Formatuje datę do formatu YYYY-MM-DD
 * @param {Date} date - obiekt daty
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Parsuje ISO timestamp do obiektu daty
 * @param {string} isoString - ISO timestamp
 */
function parseISODate(isoString) {
    return new Date(isoString.replace('Z', '+00:00'));
}

/**
 * Pobiera wszystkie statystyki dzienne dla wybranego miasta (z obsługą stronicowania)
 * @param {number} cityId - ID miasta
 */
async function getAllDailyStats(cityId) {
    try {
        let allStats = [];
        let offset = 0;
        const limit = 1000;
        
        while (true) {
            const query = `city_id=eq.${cityId}&select=date,temp_min,temp_max,temp_avg,wind_speed_avg,wind_speed_max,wind_direction_dominant,precipitation_sum,cloud_cover_avg&limit=${limit}&offset=${offset}&order=date.asc`;
            const response = await fetch(
                `${API_CONFIG.SUPABASE_URL}/rest/v1/daily_stats?${query}`,
                {
                    headers: {
                        'apikey': API_CONFIG.SUPABASE_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (!data || data.length === 0) break;
            
            allStats.push(...data);
            if (data.length < limit) break;
            
            offset += limit;
        }

        // Jeśli brak pre-kalkulowanych danych w tabeli daily_stats, generujemy je na bieżąco z weather_data
        if (allStats.length === 0) {
            console.log(`Brak danych w daily_stats dla miasta ${cityId}. Pobieram z weather_data i agreguję w locie...`);
            let allWeather = [];
            let wOffset = 0;
            const wLimit = 1000;
            while (true) {
                const wQuery = `city_id=eq.${cityId}&select=forecast_time,temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_6h,cloud_cover_total&limit=${wLimit}&offset=${wOffset}&order=forecast_time.asc`;
                const wResponse = await fetch(
                    `${API_CONFIG.SUPABASE_URL}/rest/v1/weather_data?${wQuery}`,
                    {
                        headers: {
                            'apikey': API_CONFIG.SUPABASE_KEY,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                if (!wResponse.ok) break;
                const wData = await wResponse.json();
                if (!wData || wData.length === 0) break;
                allWeather.push(...wData);
                if (wData.length < wLimit) break;
                wOffset += wLimit;
            }

            if (allWeather.length > 0) {
                const grouped = {};
                allWeather.forEach(r => {
                    if (r.forecast_time) {
                        const dateStr = r.forecast_time.split('T')[0];
                        if (!grouped[dateStr]) grouped[dateStr] = [];
                        grouped[dateStr].push(r);
                    }
                });

                Object.keys(grouped).sort().forEach(dateStr => {
                    const group = grouped[dateStr];
                    const temps = group.map(x => x.temperature_2m).filter(v => v !== null && v !== undefined);
                    const windSpeeds = group.map(x => x.wind_speed_10m).filter(v => v !== null && v !== undefined);
                    const windDirs = group.map(x => x.wind_direction_10m).filter(v => v !== null && v !== undefined);
                    const precips = group.map(x => x.precipitation_6h).filter(v => v !== null && v !== undefined);
                    const clouds = group.map(x => x.cloud_cover_total).filter(v => v !== null && v !== undefined);

                    let dominantWind = null;
                    if (windDirs.length > 0) {
                        dominantWind = windDirs.reduce((a, b) => a + b, 0) / windDirs.length;
                    }

                    allStats.push({
                        date: dateStr,
                        temp_min: temps.length > 0 ? Math.min(...temps) : null,
                        temp_max: temps.length > 0 ? Math.max(...temps) : null,
                        temp_avg: temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
                        wind_speed_avg: windSpeeds.length > 0 ? windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length : null,
                        wind_speed_max: windSpeeds.length > 0 ? Math.max(...windSpeeds) : null,
                        wind_direction_dominant: dominantWind,
                        precipitation_sum: precips.length > 0 ? precips.reduce((a, b) => a + b, 0) : 0.0,
                        cloud_cover_avg: clouds.length > 0 ? clouds.reduce((a, b) => a + b, 0) / clouds.length : null
                    });
                });
                console.log(`Wyliczono na bieżąco ${allStats.length} rekordów dla miasta ${cityId}.`);
            }
        }

        return allStats;
    } catch (error) {
        console.error('Błąd przy pobieraniu wszystkich statystyk dziennych:', error);
        return [];
    }
}

