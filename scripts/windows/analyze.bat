@echo off
rem Local static analysis, without a server, of core, plugin-api and/or ui: SpotBugs, PMD and CPD
rem (duplicated code) with the JaCoCo coverage on the Java modules; ESLint with the SonarJS rules,
rem the type check and the coverage on the UI. Then it lists the findings grouped by file
rem (scripts\CodeAnalysisReport.java). Findings are reported, they never fail the analysis.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
rem Kept now: shift also moves %0, so %~dp0 is no longer this folder after reading the options
set "COMMON=%~dp0common.bat"
call "%COMMON%" :init
set "MODULES="
set "UI="
set "RUN=yes"
set "REPORT_OPTIONS="
if not "%~1"=="" goto :args
set "COMMAND=scripts\windows\analyze.bat"
call "%COMMON%" :ask_choice "What to analyze" 1 "Everything (core, plugin-api and ui)" "core" "plugin-api" "ui"
if "%CHOICE%"=="2" set "MODULES=core"
if "%CHOICE%"=="3" set "MODULES=plugin-api"
if defined MODULES set "REPORT_OPTIONS=%MODULES%"
if "%CHOICE%"=="4" set "UI=yes"
if "%CHOICE%"=="4" set "REPORT_OPTIONS=ui"
if defined REPORT_OPTIONS set "COMMAND=%COMMAND% %REPORT_OPTIONS%"
call "%COMMON%" :ask_choice "Analysis" 1 "Run a new analysis" "Show the findings of the last analysis (fast)"
if "%CHOICE%"=="2" set "RUN="
if "%CHOICE%"=="2" set "COMMAND=%COMMAND% --report-only"
call "%COMMON%" :ask_yes_no "Also show the LOW and INFO findings (mostly style)" N
if "%ANSWER%"=="yes" set "REPORT_OPTIONS=%REPORT_OPTIONS% --all"
if "%ANSWER%"=="yes" set "COMMAND=%COMMAND% --all"
call "%COMMON%" :show_command %COMMAND%
goto :run

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
call "%COMMON%" :check_java || goto :fail
if not defined RUN goto :findings
if defined MODULES (
    call "%COMMON%" :step "Java (%MODULES%): tests, SpotBugs, PMD and CPD (mvnw -Pcode-analysis verify)"
    call "%COMMON%" :mvnw -B -Pcode-analysis verify -DskipUi=true -pl "%MODULES%" -am || goto :fail
)
if defined UI (
    call "%COMMON%" :check_node || goto :fail
    call "%COMMON%" :ensure_ui_dependencies || goto :fail
    call "%COMMON%" :step "ui: ESLint with the SonarJS rules, typecheck and coverage (npm run analyze)"
    pushd "%UI_DIR%"
    call npm run analyze || (popd & goto :fail)
    popd
)

:findings
call "%COMMON%" :step "Findings"
java "%REPO_ROOT%\scripts\CodeAnalysisReport.java" "%REPO_ROOT%" %REPORT_OPTIONS% || goto :fail
if defined MODULES for %%M in (%MODULES%) do echo Coverage of %%M: %REPO_ROOT%\%%M\target\site\jacoco\index.html
if defined UI echo Coverage of ui: %UI_DIR%\coverage\index.html
call "%COMMON%" :done 0
exit /b 0

:usage
echo Usage: scripts\windows\analyze.bat [core] [plugin-api] [ui] [--all] [--report-only]
echo.
echo   core, plugin-api, ui   What to analyze (all of them by default)
echo   --all                  Also list the LOW and INFO findings (by default only HIGH and MEDIUM)
echo   --report-only          Do not analyze again: list the findings of the last analysis
echo.
echo Every finding is also written to target\code-analysis.txt. Without options it asks what to do.
exit /b 0

:fail
call "%COMMON%" :done 1
exit /b 1
