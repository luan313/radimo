@echo off
REM Instala tudo o que o Radar Imoveis precisa (rode uma vez).
cd /d "%~dp0"
echo [1/3] Criando ambiente Python...
python -m venv .venv || goto :err
echo [2/3] Instalando dependencias...
.venv\Scripts\python -m pip install --upgrade pip >nul
.venv\Scripts\pip install -r backend\requirements.txt || goto :err
echo [3/3] Baixando o Chromium do Playwright (usado se o Chrome nao estiver instalado)...
.venv\Scripts\python -m playwright install chromium || goto :err
echo.
echo Pronto! Agora rode start.bat
pause
exit /b 0
:err
echo.
echo Algo deu errado. Confira se o Python 3.10+ esta instalado e no PATH.
pause
exit /b 1
