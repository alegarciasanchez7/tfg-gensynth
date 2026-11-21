@echo off
rem Deletes what the builds generate. With --all it also deletes the data of the application run
rem from the sources (state, logs, outputs, shared libraries and the downloaded browser).
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
rem Kept now: shift also moves %0, so %~dp0 is no longer this folder after reading the options
set "COMMON=%~dp0common.bat"
call "%COMMON%" :init
set "ALL="
set "YES="
if not "%~1"=="" goto :args
echo The build output is always deleted (target, the UI bundle and the reports).
call "%COMMON%" :ask_yes_no "Also delete the data of the application run from the sources (state, logs, outputs, shared libraries, downloaded browser)" N
rem The question above is the confirmation
if "%ANSWER%"=="yes" (
    set "ALL=yes"
    set "YES=yes"
    call "%COMMON%" :show_command scripts\windows\clean.bat --all --yes
) else (
    call "%COMMON%" :show_command scripts\windows\clean.bat
)
goto :run

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
call "%COMMON%" :step "Deleting the build output"
call "%COMMON%" :check_java || goto :fail
call "%COMMON%" :mvnw -B -q clean -DskipUi=true || goto :fail
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
call "%COMMON%" :done 0
exit /b 0

:usage
echo Usage: scripts\windows\clean.bat [--all] [--yes]
echo.
echo   --all   Also delete core\state, core\logs, core\outputs, core\lib\shared and core\jcef-bundle
echo           (installed plugins in core\plugins are kept)
echo   --yes   Do not ask for confirmation
echo.
echo Without options it asks what to do.
exit /b 0

:fail
call "%COMMON%" :done 1
exit /b 1
