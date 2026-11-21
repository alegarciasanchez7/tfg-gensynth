#!/usr/bin/env bash
# Compiles and starts the gensynth command line from the sources. The UI is not built: the
# command line does not use it.
# Run it without options to be asked what to do.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/run-cli.sh [--cli-edition] [--no-build] [--version|--help]

  --cli-edition   Behave like the CLI edition installer (no edit command)
  --no-build      Start what was compiled last, without compiling
  Other options are passed to gensynth (--version).

Without options it asks what to do.

The command line starts in core/, as the application does from the sources: relative paths
typed in it start there (absolute paths and ~ work anywhere).
USAGE
}

java_options=()
cli_args=()
build=true
if asks_options $#; then
    command="scripts/unix/run-cli.sh"
    ask_choice "Which command line" 1 \
        "Full application (with edit, which opens projects in the window)" \
        "CLI edition (as the CLI edition installer: no edit)"
    if [ "$CHOICE" = 2 ]; then
        java_options+=("-Dgensynth.edition=cli")
        command="$command --cli-edition"
    fi
    if ! ask_yes_no "Compile before starting" y; then
        build=false
        command="$command --no-build"
    fi
    show_command "$command"
fi
while [ $# -gt 0 ]; do
    case "$1" in
        --cli-edition) java_options+=("-Dgensynth.edition=cli") ;;
        --no-build) build=false ;;
        -h|--help) usage; exit 0 ;;
        *) cli_args+=("$1") ;;
    esac
    shift
done

check_java
if [ "$build" = false ] && needs_build; then
    warn "Nothing is compiled yet: compiling first."
    build=true
fi
if [ "$build" = true ]; then
    step "Compiling"
    build_runtime skip-ui -q
fi

cd "$CORE_DIR"
exec java ${java_options[@]+"${java_options[@]}"} -cp "$(runtime_classpath)" com.gensynth.core.cli.CliMain ${cli_args[@]+"${cli_args[@]}"}
