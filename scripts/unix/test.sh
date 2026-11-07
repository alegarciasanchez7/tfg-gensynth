#!/usr/bin/env bash
# Runs the same checks as the CI: backend tests with coverage, then the UI lint, type check,
# tests with coverage and build.
# Run it without options to be asked what to do.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/test.sh [--backend | --frontend]

  --backend    Only the Java modules (mvnw verify)
  --frontend   Only the UI (lint, typecheck, tests with coverage, build)

Without options it asks what to do.
USAGE
}

backend=true
frontend=true
if asks_options $#; then
    ask_choice "What to check" 1 "Backend and frontend, as the CI" "Backend only (mvnw verify)" "Frontend only (lint, typecheck, tests, build)"
    case "$CHOICE" in
        1) show_command "scripts/unix/test.sh" ;;
        2) frontend=false; show_command "scripts/unix/test.sh --backend" ;;
        3) backend=false; show_command "scripts/unix/test.sh --frontend" ;;
    esac
fi
while [ $# -gt 0 ]; do
    case "$1" in
        --backend) frontend=false ;;
        --frontend) backend=false ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done

if [ "$backend" = true ]; then
    check_java
    step "Backend: mvnw verify"
    # The UI is checked by its own steps below
    mvnw -B verify -DskipUi=true
fi

if [ "$frontend" = true ]; then
    check_node
    ensure_ui_dependencies
    cd "$UI_DIR"
    step "Frontend: lint";       npm run lint
    step "Frontend: typecheck";  npm run typecheck
    step "Frontend: tests";      npm run test:coverage
    step "Frontend: build";      npm run build
fi

success "All checks passed."
