-- Tabela główna: dane pogodowe dla Lubelszczyzny
-- Schemat zapisuje surowe dane z NOAA GFS w regularnych przedziałach czasowych
CREATE TABLE IF NOT EXISTS weather_data (
    id BIGSERIAL PRIMARY KEY,

    -- Metadane lokalizacji
    latitude DECIMAL(10, 6) NOT NULL,
    longitude DECIMAL(10, 6) NOT NULL,
    location_name VARCHAR(255),

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

    -- Metadane techniczne
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Indeksy dla szybkich zapytań
    UNIQUE(latitude, longitude, forecast_time)
);

-- Indeks geoprzestrzenni (wymaga rozszerzenia PostGIS - opcjonalne)
-- CREATE INDEX idx_weather_location ON weather_data USING GIST(ll_to_earth(latitude, longitude));

-- Indeks czasowy dla szybkich zapytań po dacie
CREATE INDEX idx_weather_time ON weather_data(forecast_time DESC);
CREATE INDEX idx_weather_location ON weather_data(latitude, longitude);

-- Tabela: cache statystyk dziennych (dla Firestore)
-- Przechowuje już wyliczone agregaty, aby oszczędzać zapytania do Supabase
CREATE TABLE IF NOT EXISTS daily_stats (
    id BIGSERIAL PRIMARY KEY,

    -- Data i lokalizacja
    date DATE NOT NULL,
    latitude DECIMAL(10, 6) NOT NULL,
    longitude DECIMAL(10, 6) NOT NULL,
    location_name VARCHAR(255),

    -- Statystyki temperatury
    temp_min DECIMAL(5, 2),
    temp_max DECIMAL(5, 2),
    temp_avg DECIMAL(5, 2),

    -- Statystyki wiatru
    wind_speed_avg DECIMAL(5, 2),
    wind_speed_max DECIMAL(5, 2),
    wind_direction_dominant DECIMAL(6, 2),

    -- Suma opadów
    precipitation_sum DECIMAL(8, 2),

    -- Średnie zachmurzenie
    cloud_cover_avg DECIMAL(5, 2),

    -- Metadane
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, latitude, longitude)
);

CREATE INDEX idx_daily_stats_date ON daily_stats(date DESC);
CREATE INDEX idx_daily_stats_location ON daily_stats(latitude, longitude);

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
ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Policy: publiczny dostęp do odczytu (bez uwierzytelnienia)
CREATE POLICY "public_read_weather_data" ON weather_data
    FOR SELECT
    USING (true);

CREATE POLICY "public_read_daily_stats" ON daily_stats
    FOR SELECT
    USING (true);

-- Policy: wstawienie i aktualizacja tylko dla backend (wymagają API key)
CREATE POLICY "backend_write_weather_data" ON weather_data
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "backend_write_daily_stats" ON daily_stats
    FOR INSERT
    WITH CHECK (true);
