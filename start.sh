#!/bin/bash
echo "============================================"
echo "  Rajasthan Dashboard - Starting Up"
echo "============================================"

echo ""
echo "[1/2] Starting Python Backend (FastAPI)..."
cd backend
pip install -r requirements.txt -q
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

echo ""
echo "[2/2] Starting React Frontend..."
cd ../frontend
npm install -q
npm start &
FRONTEND_PID=$!

echo ""
echo "============================================"
echo " Backend  → http://localhost:8000"
echo " Frontend → http://localhost:3000"
echo " API Docs → http://localhost:8000/docs"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
