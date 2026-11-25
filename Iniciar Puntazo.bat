@echo off
title Puntazo
cd /d "%~dp0"
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=%ProgramFiles%\nodejs\node.exe"
if not "%NODE%"=="node" if not exist "%NODE%" (
  echo Falta Node.js. Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b
)
"%NODE%" server.js
pause
