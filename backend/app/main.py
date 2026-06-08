from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle."""
    # Startup
    print("✓ KlimatPolski API starting...")
    yield
    # Shutdown
    print("✓ KlimatPolski API shutting down...")


app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {"message": "KlimatPolski API", "version": settings.API_VERSION}


# API routes
# from .api.routes import weather
# app.include_router(weather.router, prefix="/api/weather", tags=["weather"])
