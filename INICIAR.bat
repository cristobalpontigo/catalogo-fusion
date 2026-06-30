@echo off
title Catalogo Fusion
cd /d "%~dp0"

echo.
echo  ========================================
echo   CATALOGO FUSION - Iniciando...
echo  ========================================
echo   Carpeta: %cd%
echo.

REM Intentar abrir con servidor Python (recomendado)
where python >nul 2>&1
if %errorlevel%==0 (
  echo  Servidor: Python en http://localhost:5500
  echo  Presiona Ctrl+C para detener.
  echo.
  start "" "http://localhost:5500"
  python -m http.server 5500
  goto :fin
)

where py >nul 2>&1
if %errorlevel%==0 (
  echo  Servidor: Python en http://localhost:5500
  echo  Presiona Ctrl+C para detener.
  echo.
  start "" "http://localhost:5500"
  py -m http.server 5500
  goto :fin
)

REM Sin Python: abrir directo (tambien funciona)
echo  Python no encontrado. Abriendo index.html directo...
echo.
start "" "%cd%\index.html"

:fin
pause
