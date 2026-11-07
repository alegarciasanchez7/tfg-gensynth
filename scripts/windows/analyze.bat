@echo off
rem Local static analysis, without a server, of core, plugin-api and/or ui: SpotBugs, PMD and CPD
rem (duplicated code) with the JaCoCo coverage on the Java modules; ESLint with the SonarJS rules,
rem the type check and the coverage on the UI. Then it lists the findings grouped by file
rem (scripts\CodeAnalysisReport.java). Findings are reported, they never fail the analysis.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
call "%~dp0common.bat" :init
set "MODULES="
set "UI="
set "RUN=yes"
set "REPORT_OPTIONS="

:args
if "%~1"=="" goto :run
if /i "%~1"=="core" goto :module
if /i "%~1"=="plugin-api" goto :module
if /i "%~1"=="ui" (set "UI=yes" & set "REPORT_OPTIONS=%REPORT_OPTIONS% ui" & shift & goto :args)
if /i "%~1"=="--all" (set "REPORT_OPTIONS=%REPORT_OPTIONS% --all" & shift & goto :args)
if /i "%~1"=="--report-only" (set "RUN=" & shift & goto :args)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
echo Error: Unknown option: %~1
goto :fail
:module
rem Comma-separated list for -pl
if defined MODULES (set "MODULES=%MODULES%,%~1") else (set "MODULES=%~1")
set "REPORT_OPTIONS=%REPORT_OPTIONS% %~1"
shift
goto :args

:run
if not defined MODULES if not defined UI (
    set "MODULES=core,plugin-api"
    set "UI=yes"
)
call "%~dp0common.bat" :check_java || goto :fail
if not defined RUN goto :findings
if defined MODULES (
    call "%~dp0common.bat" :step "Java (%MODULES%): tests, SpotBugs, PMD and CPD (mvnw -Pcode-analysis verify)"
    call "%~dp0common.bat" :mvnw -B -Pcode-analysis verify -DskipUi=true -pl "%MODULES%" -am || goto :fail
)
if defined UI (
    call "%~dp0common.bat" :check_node || goto :fail
    call "%~dp0common.bat" :ensure_ui_dependencies || goto :fail
    call "%~dp0common.bat" :step "ui: ESLint with the SonarJS rules, typecheck and coverage (npm run analyze)"
    pushd "%UI_DIR%"
    call npm run analyze || (popd & goto :fail)
    popd
)

:findings
call "%~dp0common.bat" :step "Findings"
java "%REPO_ROOT%\scripts\CodeAnalysisReport.java" "%REPO_ROOT%" %REPORT_OPTIONS% || goto :fail
if defined MODULES for %%M in (%MODULES%) do echo Coverage of %%M: %REPO_ROOT%\%%M\target\site\jacoco\index.html
if defined UI echo Coverage of ui: %UI_DIR%\coverage\index.html
call "%~dp0common.bat" :done 0
exit /b 0

:usage
echo Usage: scripts\windows\analyze.bat [core] [plugin-api] [ui] [--all] [--report-only]
echo.
echo   core, plugin-api, ui   What to analyze (all of them by default)
echo   --all                  Also list the LOW and INFO findings (by default only HIGH and MEDIUM)
echo   --report-only          Do not analyze again: list the findings of the last analysis
echo.
echo Every finding is also written to target\code-analysis.txt.
exit /b 0

:fail
call "%~dp0common.bat" :done 1
exit /b 1
