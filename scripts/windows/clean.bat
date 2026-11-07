@echo off
rem Deletes what the builds generate. With --all it also deletes the data of the application run
rem from the sources (state, logs, outputs, shared libraries and the downloaded browser).
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
call "%~dp0common.bat" :init
set "ALL="
set "YES="

:args
if "%~1"=="" goto :run
if /i "%~1"=="--all" (set "ALL=yes" & shift & goto :args)
if /i "%~1"=="--yes" (set "YES=yes" & shift & goto :args)
if /i "%~1"=="-y" (set "YES=yes" & shift & goto :args)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
echo Error: Unknown option: %~1
goto :fail

:run
call "%~dp0common.bat" :step "Deleting the build output"
call "%~dp0common.bat" :check_java || goto :fail
call "%~dp0common.bat" :mvnw -B -q clean -DskipUi=true || goto :fail
for %%D in ("%UI_DIR%\dist" "%UI_DIR%\coverage" "%UI_DIR%\reports" "%CORE_DIR%\src\main\resources\ui") do if exist "%%~D" rd /s /q "%%~D"

if not defined ALL goto :clean
if defined YES goto :delete_data
echo This also deletes:
for %%D in (state logs outputs lib\shared jcef-bundle) do echo   %CORE_DIR%\%%D
set "ANSWER="
set /p "ANSWER=Continue? [y/N] "
if /i "%ANSWER%"=="y" goto :delete_data
if /i "%ANSWER%"=="yes" goto :delete_data
echo Nothing else was deleted.
goto :clean
:delete_data
for %%D in (state logs outputs lib\shared jcef-bundle) do if exist "%CORE_DIR%\%%D" rd /s /q "%CORE_DIR%\%%D"

:clean
echo Clean.
call "%~dp0common.bat" :done 0
exit /b 0

:usage
echo Usage: scripts\windows\clean.bat [--all] [--yes]
echo.
echo   --all   Also delete core\state, core\logs, core\outputs, core\lib\shared and core\jcef-bundle
echo           (installed plugins in core\plugins are kept)
echo   --yes   Do not ask for confirmation
exit /b 0

:fail
call "%~dp0common.bat" :done 1
exit /b 1
