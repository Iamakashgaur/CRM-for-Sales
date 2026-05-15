@echo off
cd /d "%~dp0"
echo Starting CRM Pro (Next.js)...
echo.
echo Open browser at: http://localhost:3000
echo Login: admin@crm.com / Admin1234!
echo Press Ctrl+C to stop.
echo.
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"
call npm run dev
pause
