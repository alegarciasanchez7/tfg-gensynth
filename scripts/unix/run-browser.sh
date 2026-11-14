#!/usr/bin/env bash
# Starts the core without a window (WebSocket on port 8765) and the Vite dev server of the UI
# (http://localhost:5173), with hot reload of the UI. Ctrl+C stops both.
# Run it without options to be asked what to do.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/run-browser.sh [--no-build]

  --no-build   Start the core compiled last, without compiling

Without options it asks what to do.
USAGE
}

build=true
if asks_options $#; then
    if ask_yes_no "Compile the core before starting" y; then
        show_command "scripts/unix/run-browser.sh"
    else
        build=false
        show_command "scripts/unix/run-browser.sh --no-build"
    fi
fi
while [ $# -gt 0 ]; do
    case "$1" in
        --no-build) build=false ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done

check_java
check_node
if [ "$build" = false ] && needs_build; then
    warn "Nothing is compiled yet: compiling first."
    build=true
fi
if [ "$build" = true ]; then
    step "Compiling the core"
    build_runtime skip-ui -q
fi
ensure_ui_dependencies

step "Starting the core (ws://localhost:8765)"
(cd "$CORE_DIR" && exec java -cp "$(runtime_classpath)" com.gensynth.core.App) &
core_pid=$!
trap 'kill "$core_pid" 2>/dev/null || true; wait "$core_pid" 2>/dev/null || true' EXIT INT TERM

step "Starting the UI dev server: open http://localhost:5173 (Ctrl+C stops both)"
cd "$UI_DIR"
npm run dev
