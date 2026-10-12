@echo off
setlocal enabledelayedexpansion

title Portal Data Epistem - Server Lokal

:: Pindah ke direktori skrip ini berada
cd /d "%~dp0"

echo ========================================================
echo   Portal Data Epistem (Kabupaten Banyuasin 2026)
echo   Memeriksa ketersediaan runtime Python...
echo ========================================================

:: Periksa perintah py -3 atau python
set "PY_CMD="
py -3 --version >nul 2>&1
if !errorlevel! equ 0 (
    set "PY_CMD=py -3"
) else (
    python --version >nul 2>&1
    if !errorlevel! equ 0 (
        set "PY_CMD=python"
    )
)

if "%PY_CMD%"=="" (
    echo.
    echo [ERROR] Python tidak ditemukan pada sistem ini.
    echo.
    echo Panduan pemasangan Python di Windows:
    echo 1. Unduh penginstal Python resmi dari https://www.python.org/downloads/
    echo 2. Saat menjalankan penginstal, pastikan mencentang pilihan:
    echo    "Add Python to PATH" atau "Add python.exe to PATH"
    echo 3. Selesaikan instalasi dan jalankan kembali berkas start-windows.bat.
    echo.
    echo Tekan tombol apa saja untuk menutup jendela ini...
    pause >nul
    exit /b 1
)

echo Python terdeteksi: !PY_CMD!
echo Menjalankan peladen HTTP lokal pada http://127.0.0.1:8765/ ...
echo (Tekan Ctrl+C di jendela ini untuk menghentikan peladen)
echo.

:: Buka peramban default setelah jeda singkat di latar belakang
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8765/"

:: Jalankan peladen HTTP terikat khusus ke localhost (127.0.0.1)
!PY_CMD! -m http.server 8765 --bind 127.0.0.1

pause
