@echo off
rem Builds the installers of this OS, as the release does: the full application in
rem core\target\installer\dist and the CLI edition in core\target\installer\dist-cli (.msi files,
rem which need WiX Toolset 3 on the PATH).
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
call "%~dp0common.bat" :init

:args
if "%~1"=="" goto :run
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
echo Error: Unknown option: %~1
goto :fail

:run
call "%~dp0common.bat" :check_java || goto :fail
call "%~dp0common.bat" :check_node || goto :fail
where candle.exe >nul 2>nul || (echo Error: WiX Toolset 3 was not found ^(candle.exe^). Install it from https://github.com/wixtoolset/wix3/releases and add its bin folder to PATH.& goto :fail)

call "%~dp0common.bat" :step "Building the installers (mvnw -Dinstaller -DskipTests clean package)"
call "%~dp0common.bat" :mvnw -B -Dinstaller -DskipTests clean package || goto :fail

call "%~dp0common.bat" :step "Installers"
dir /b "%CORE_DIR%\target\installer\dist" "%CORE_DIR%\target\installer\dist-cli"
call "%~dp0common.bat" :done 0
exit /b 0

:usage
echo Usage: scripts\windows\package.bat
echo.
echo Builds GenSynth-*.msi (full application) and GenSynth-CLI-*.msi (CLI edition).
exit /b 0

:fail
call "%~dp0common.bat" :done 1
exit /b 1
