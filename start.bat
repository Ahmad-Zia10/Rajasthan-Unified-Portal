@echo off
echo ============================================
echo   Rajasthan Dashboard - Starting Up
echo ============================================

echo.
echo [1/2] Starting Python Backend (FastAPI)...
cd backend
start cmd /k "pip install -r requirements.txt && uvicorn main:app --reload --port 8000"

echo.
echo [2/2] Starting React Frontend...
cd ../frontend
start cmd /k "npm install && npm start"

echo.
echo ============================================
echo  Backend running at: http://localhost:8000
echo  Frontend running at: http://localhost:3000
echo ============================================
pause
