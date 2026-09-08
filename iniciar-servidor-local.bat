@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Dev Server - Bukan Santos (http://localhost:8080)

echo ============================================================
echo   Iniciando Servidor de Desenvolvimento - Bukan Santos
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao esta instalado ou nao foi encontrado no PATH.
  echo Baixe o Node.js em: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo [1/2] Abrindo navegador em http://localhost:8080 ...
start http://localhost:8080

echo [2/2] Subindo dev server com Live Reload e sem cache...
echo Pressione Ctrl+C para encerrar o servidor.
echo.

node scripts/dev-server.mjs

pause
