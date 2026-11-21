#!/usr/bin/env bash
# Compiles and starts the desktop application from the sources. Any other argument (such as a
# .gsynth file to open) is passed to the application.
# Run it without options to be asked what to do.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/run-desktop.sh [--skip-ui] [--no-build] [file.gsynth]

  --skip-ui    Keep the React UI already built instead of building it again
  --no-build   Start what was compiled last, without compiling

Without options it asks what to do.
USAGE
}

build_options=""
build=true
app_args=()
# The application starts in core/: a file is passed with its absolute path
add_file() {
    if [ -e "$1" ]; then
        app_args+=("$(cd "$(dirname "$1")" && pwd)/$(basename "$1")")
    else
        app_args+=("$1")
    fi
}

if asks_options $#; then
    command="scripts/unix/run-desktop.sh"
    if ask_yes_no "Compile before starting" y; then
        if ! ask_yes_no "Build the user interface too" y; then
            build_options="skip-ui"
            command="$command --skip-ui"
        fi
    else
        build=false
        command="$command --no-build"
    fi
    ask_text "Project file to open (Enter for none)"
    if [ -n "$ANSWER" ]; then
        # ~ is not expanded by read
        case "$ANSWER" in "~"/*) ANSWER="$HOME/${ANSWER#"~/"}" ;; esac
        add_file "$ANSWER"
        command="$command \"$ANSWER\""
    fi
    show_command "$command"
fi
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-ui) build_options="skip-ui" ;;
        --no-build) build=false ;;
        -h|--help) usage; exit 0 ;;
        -*) app_args+=("$1") ;;
        *) add_file "$1" ;;
    esac
    shift
done

check_java
if [ "$build" = false ] && needs_build; then
    warn "Nothing is compiled yet: compiling first."
    build=true
fi
if [ "$build" = true ]; then
    [ -n "$build_options" ] || check_node
    step "Compiling"
    # shellcheck disable=SC2086
    build_runtime $build_options -q
fi
[ -d "$CORE_DIR/src/main/resources/ui" ] || warn "The UI has not been built yet: build it once (answer yes, or run without --skip-ui)."

java_options=()
if is_jetbrains_runtime; then
    # The JetBrains Runtime has its own jcef module, which must be replaced by the library's
    for jcef_jar in "$CORE_DIR/$DEV_LIB"/jcef-api-*.jar; do
        [ -f "$jcef_jar" ] && java_options+=("--patch-module" "jcef=$jcef_jar")
        break
    done
fi

step "Starting the desktop application (the first start downloads the embedded browser)"
cd "$CORE_DIR"
exec java ${java_options[@]+"${java_options[@]}"} -cp "$(runtime_classpath)" com.gensynth.core.App --desktop ${app_args[@]+"${app_args[@]}"}
