#!/usr/bin/env bash
# Local static analysis, without a server, of core, plugin-api and/or ui: SpotBugs, PMD and CPD
# (duplicated code) with the JaCoCo coverage on the Java modules; ESLint with the SonarJS rules,
# the type check and the coverage on the UI. Then it lists the findings grouped by file
# (scripts/CodeAnalysisReport.java). Findings are reported, they never fail the analysis.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/analyze.sh [core] [plugin-api] [ui] [--all] [--report-only]

  core, plugin-api, ui   What to analyze (all of them by default)
  --all                  Also list the LOW and INFO findings (by default only HIGH and MEDIUM)
  --report-only          Do not analyze again: list the findings of the last analysis

Every finding is also written to target/code-analysis.txt.
USAGE
}

modules=()
ui=false
run=true
report_options=()
while [ $# -gt 0 ]; do
    case "$1" in
        core|plugin-api) modules+=("$1"); report_options+=("$1") ;;
        ui) ui=true; report_options+=("ui") ;;
        --all) report_options+=("--all") ;;
        --report-only) run=false ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done
if [ ${#modules[@]} -eq 0 ] && [ "$ui" = false ]; then
    modules=(core plugin-api)
    ui=true
fi

check_java
if [ "$run" = true ] && [ ${#modules[@]} -gt 0 ]; then
    # Comma-separated list for -pl; -am also builds what they depend on
    selected="$(IFS=,; echo "${modules[*]}")"
    step "Java ($selected): tests, SpotBugs, PMD and CPD (mvnw -Pcode-analysis verify)"
    mvnw -B -Pcode-analysis verify -DskipUi=true -pl "$selected" -am
fi

if [ "$run" = true ] && [ "$ui" = true ]; then
    check_node
    ensure_ui_dependencies
    step "ui: ESLint with the SonarJS rules, typecheck and coverage (npm run analyze)"
    (cd "$UI_DIR" && npm run analyze)
fi

step "Findings"
java "$REPO_ROOT/scripts/CodeAnalysisReport.java" "$REPO_ROOT" ${report_options[@]+"${report_options[@]}"}
for module in ${modules[@]+"${modules[@]}"}; do
    echo "Coverage of $module: $REPO_ROOT/$module/target/site/jacoco/index.html"
done
if [ "$ui" = true ]; then
    echo "Coverage of ui: $UI_DIR/coverage/index.html"
fi
