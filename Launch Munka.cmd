@echo off
cd /d "%~dp0"
node scripts\prepare-assets.cjs
if errorlevel 1 goto failed
node scripts\launch.cjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo Munka did not start successfully. Keep this window open to read the error above.
pause
exit /b 1
