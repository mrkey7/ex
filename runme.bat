@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3 Global\server.py
    goto selesai
)
where python >nul 2>&1
if not errorlevel 1 (
    python Global\server.py
    goto selesai
)
echo Python 3 tidak ditemukan.
echo Instal Python 3, lalu jalankan kembali file ini.
pause
:selesai
endlocal
