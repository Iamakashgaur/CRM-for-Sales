@echo off
echo Starting CRM Task Reminder...
echo.
echo Open your browser at: http://localhost:8080
echo Press Ctrl+C to stop the server.
echo.
start "" http://localhost:8080
python -m http.server 8080
pause
