/**
 * API - Komunikacja z Supabase (dane pogodowe) i Firestore (cache statystyk)
 */

const API_CONFIG = {
    SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL || 'https://your-project.supabase.co',
    SUPABASE_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY || 'your-anon-key',
    FIRESTORE_PROJECT_ID: import.meta.env?.VITE_FIREBASE_PROJECT_ID || 'your-project-id'
};

/**
 * Pobiera dostępne lokalizacje z Supabase
 */
async function getAvailableLocations() {
    try {
        const response = await fetch(
            `${API_CONFIG.SUPABASE_URL}/rest/v1/weather_data?select=latitude,longitude,location_name&distinct=on(latitude,longitude)`,
            {
                headers: {
                    'apikey': API_CONFIG.SUPABASE_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const locations = await response.json();
        return locations || [];
    } catch (error) {
        console.error('Błąd przy pobieraniu lokalizacji:', error);
        return [];
    }
}

/**
 * Pobiera dane pogodowe dla wybranego miejsca i okresu
 * @param {number} lat - szerokość geograficzna
 * @param {number} lon - długość geograficzna
 * @param {string} startDate - data początkowa (YYYY-MM-DD)
 * @param {string} endDate - data końcowa (YYYY-MM-DD)
 */
async function getWeatherData(lat, lon, startDate, endDate) {
    try {
        // Zaokrąglij współrzędne do 0.01° dokładności
        const latRounded = Math.round(lat * 100) / 100;
        const lonRounded = Math.round(lon * 100) / 100;

        // Zbuduj filtr RLS dla Supabase
        const query = `latitude=eq.${latRounded}&longitude=eq.${lonRounded}&forecast_time=gte.${startDate}T00:00:00Z&forecast_time=lte.${endDate}T23:59:59Z&order=forecast_time.asc`;

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
 * @param {number} lat - szerokość geograficzna
 * @param {number} lon - długość geograficzna
 * @param {string} date - data (YYYY-MM-DD)
 */
async function getDailyStats(lat, lon, date) {
    try {
        const latRounded = Math.round(lat * 100) / 100;
        const lonRounded = Math.round(lon * 100) / 100;

        const query = `latitude=eq.${latRounded}&longitude=eq.${lonRounded}&date=eq.${date}`;

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
