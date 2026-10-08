@echo off
title VocalVault - Singer Practice Tracker
echo ========================================================
echo   Starting VocalVault - Singer Practice Tracker
echo ========================================================
echo.
echo Opening browser at http://127.0.0.1:5000 ...
start http://127.0.0.1:5000
echo Running Flask server... Press Ctrl+C to stop.
echo.
python app.py
pause
