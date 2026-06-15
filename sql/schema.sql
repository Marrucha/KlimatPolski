-- Tabela: słownik miast (lookup table)
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    latitude DECIMAL(10, 6) NOT NULL,
    longitude DECIMAL(10, 6) NOT NULL,
    latitude_real DECIMAL(10, 6),
    longitude_real DECIMAL(10, 6),
    distance_km DECIMAL(8, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name);

-- Tabela główna: dane pogodowe dla Lubelszczyzny
-- Schemat zapisuje surowe dane z NOAA GFS w regularnych przedziałach czasowych
CREATE TABLE IF NOT EXISTS weather_data (
    id BIGSERIAL PRIMARY KEY,

    -- Metadane lokalizacji
    city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,

    -- Metadane czasowe
    forecast_time TIMESTAMP WITH TIME ZONE NOT NULL,
    data_source VARCHAR(50) DEFAULT 'NOAA_GFS',

    -- Zmienne meteorologiczne
    temperature_2m DECIMAL(5, 2),              -- °C, wysokość 2m
    u_wind_10m DECIMAL(5, 2),                 -- m/s, składowa U (10m)
    v_wind_10m DECIMAL(5, 2),                 -- m/s, składowa V (10m)
    wind_speed_10m DECIMAL(5, 2),             -- m/s, prędkość wyliczona: sqrt(U^2 + V^2)
    wind_direction_10m DECIMAL(6, 2),         -- °, kierunek: atan2(U, V) * 180/pi
    precipitation_6h DECIMAL(8, 2),           -- mm, suma opadów z 6 godzin (APCP)
    cloud_cover_total DECIMAL(5, 2),          -- %, zachmurzenie całkowite (TCDC)
    sea_surface_temperature DECIMAL(5, 2),    -- °C, temperatura powierzchni wody (SST)
    pressure_msl DECIMAL(8, 2),               -- hPa, średnie ciśnienie na poziomie morza (MSL)
    wind_gust_10m DECIMAL(5, 2),              -- m/s, porywy wiatru na 10m (10FG)
    snowfall_6h DECIMAL(8, 2),                -- mm (opad wody), suma opadu śniegu z 6 godzin (SF)
    dewpoint_temperature_2m DECIMAL(5, 2),    -- °C, temperatura punktu rosy na wysokości 2m (D2M)
    relative_humidity_2m DECIMAL(5, 2),       -- %, wilgotność względna na wysokości 2m (wyliczona z T2m i D2m)

    -- Metadane techniczne
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Indeksy dla szybkich zapytań
    UNIQUE(city_id, forecast_time)
);

-- Indeks czasowy dla szybkich zapytań po dacie
CREATE INDEX IF NOT EXISTS idx_weather_time ON weather_data(forecast_time DESC);
CREATE INDEX IF NOT EXISTS idx_weather_city_id ON weather_data(city_id);
CREATE INDEX IF NOT EXISTS idx_weather_city_time ON weather_data(city_id, forecast_time DESC);

-- Tabela: cache statystyk dziennych (dla Firestore)
-- Przechowuje już wyliczone agregaty, aby oszczędzać zapytania do Supabase
CREATE TABLE IF NOT EXISTS daily_stats (
    id BIGSERIAL PRIMARY KEY,

    -- Data i lokalizacja
    date DATE NOT NULL,
    city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,

    -- Statystyki temperatury
    temp_min DECIMAL(5, 2),
    temp_max DECIMAL(5, 2),
    temp_avg DECIMAL(5, 2),

    -- Statystyki wiatru
    wind_speed_avg DECIMAL(5, 2),
    wind_speed_max DECIMAL(5, 2),
    wind_direction_dominant DECIMAL(6, 2),
    wind_gust_max DECIMAL(5, 2),

    -- Suma opadów
    precipitation_sum DECIMAL(8, 2),
    snowfall_sum DECIMAL(8, 2),

    -- Średnie zachmurzenie
    cloud_cover_avg DECIMAL(5, 2),

    -- Statystyki ciśnienia
    pressure_msl_min DECIMAL(8, 2),
    pressure_msl_max DECIMAL(8, 2),
    pressure_msl_avg DECIMAL(8, 2),

    -- Statystyki temperatury punktu rosy
    dewpoint_2m_min DECIMAL(5, 2),
    dewpoint_2m_max DECIMAL(5, 2),
    dewpoint_2m_avg DECIMAL(5, 2),

    -- Statystyki wilgotności
    humidity_2m_min DECIMAL(5, 2),
    humidity_2m_max DECIMAL(5, 2),
    humidity_2m_avg DECIMAL(5, 2),

    -- Statystyki temperatury powierzchni wody
    sea_surface_temp_min DECIMAL(5, 2),
    sea_surface_temp_max DECIMAL(5, 2),
    sea_surface_temp_avg DECIMAL(5, 2),

    -- Metadane
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, city_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_city_id ON daily_stats(city_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_city_date ON daily_stats(city_id, date DESC);

-- Tabela: logi przebiegu synchronizacji
CREATE TABLE IF NOT EXISTS sync_logs (
    id BIGSERIAL PRIMARY KEY,

    sync_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20),                        -- 'success', 'error', 'partial'
    records_fetched INTEGER,
    records_inserted INTEGER,
    records_updated INTEGER,
    error_message TEXT,

    execution_time_seconds DECIMAL(10, 2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Umożliwienie RLS (Row Level Security) dla publik dostępu
-- cities: brak RLS (publiczny dostęp do odczytu i zapisu)
ALTER TABLE cities DISABLE ROW LEVEL SECURITY;

ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Policy: publiczny dostęp do odczytu (bez uwierzytelnienia)
CREATE POLICY IF NOT EXISTS "public_read_weather_data" ON weather_data
    FOR SELECT
    USING (true);

CREATE POLICY IF NOT EXISTS "public_read_daily_stats" ON daily_stats
    FOR SELECT
    USING (true);

-- Policy: wstawienie i aktualizacja tylko dla backend (wymagają API key)
CREATE POLICY IF NOT EXISTS "backend_write_weather_data" ON weather_data
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "backend_write_daily_stats" ON daily_stats
    FOR INSERT
    WITH CHECK (true);
