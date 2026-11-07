#!/usr/bin/env bash
# Prepares a fresh clone for development: checks the tools, installs the UI dependencies,
# builds and installs every module (plugin API, RabbitMQ, core with the UI and the private
# plugins when present) and leaves the core ready to run.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/setup.sh [--skip-ui]

  --skip-ui   Do not build the React UI (no Node.js needed); the desktop window will not work
USAGE
}

skip_ui=false
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-ui) skip_ui=true ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done

step "Checking the tools"
check_java
echo "Java $(java_major): $(command -v java)"
if [ "$skip_ui" = false ]; then
    check_node
    echo "Node.js $(node --version): $(command -v node)"
fi

if [ "$skip_ui" = false ]; then
    step "Installing the UI dependencies (npm ci)"
    (cd "$UI_DIR" && npm ci)
fi

step "Building and installing every module (mvnw clean install -DskipTests)"
if [ "$skip_ui" = true ]; then
    mvnw -B clean install -DskipTests -DskipUi=true
else
    mvnw -B clean install -DskipTests
fi

step "Preparing the core to run from the sources"
build_runtime skip-ui

success "GenSynth is ready for development."
cat <<NEXT

Next steps:
  scripts/unix/run-desktop.sh     desktop application
  scripts/unix/run-cli.sh         gensynth command line
  scripts/unix/run-browser.sh     core + UI dev server with hot reload (http://localhost:5173)
  scripts/unix/test.sh            backend and frontend tests, as the CI runs them
  scripts/unix/compile.sh         compile after changing the code
NEXT
