import os
import sys
import logging

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import asyncio
from app.api.endpoints import router as api_router
from app.core.config import settings
from app.core.firebase import firebase_manager
from app.services.irrigation_service import irrigation_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("nt131-backend")

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    description="Hệ thống giám sát và điều khiển tưới nước tự động từ xa IoT (Vietduino ESP32 & Firebase RTDB)"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(api_router, prefix=settings.API_V1_STR)

# Frontend files (located in separate frontend/ folder)
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    css_dir = os.path.join(frontend_dir, "css")
    js_dir = os.path.join(frontend_dir, "js")
    if os.path.exists(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.exists(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")

    @app.api_route("/", methods=["GET", "HEAD"])
    def serve_frontend():
        index_file = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": f"Welcome to {settings.PROJECT_NAME}. Visit /docs for API documentation."}

scheduler_task = None

async def run_scheduler_loop():
    logger.info("Starting Irrigation Background Scheduler Loop...")
    while True:
        try:
            await irrigation_service.check_and_run_schedules()
        except asyncio.CancelledError:
            logger.info("Irrigation Scheduler Loop cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in scheduler loop: {e}")
        await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    global scheduler_task
    logger.info("Initializing Smart Irrigation System Backend...")
    logger.info(f"Mock Mode: {firebase_manager.mock_mode}")
    scheduler_task = asyncio.create_task(run_scheduler_loop())

@app.on_event("shutdown")
async def shutdown_event():
    global scheduler_task
    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
    logger.info("Smart Irrigation System Backend shutdown complete.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
