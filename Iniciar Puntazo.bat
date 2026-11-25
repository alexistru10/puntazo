@echo off
title Puntazo
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b
)
node server.js
pause
