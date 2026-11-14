#!/usr/bin/env bash
# Deletes the previous build (mvnw clean) and compiles every module from scratch.
# Run it without options to be asked what to do.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/clean-compile.sh [--skip-ui]

  --skip-ui   Keep the React UI already built instead of building it again

Without options it asks what to do.
USAGE
}

options="clean "
if asks_options $#; then
    if ask_yes_no "Build the user interface too" y; then
        show_command "scripts/unix/clean-compile.sh"
    else
        options="clean skip-ui"
        show_command "scripts/unix/clean-compile.sh --skip-ui"
    fi
fi
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-ui) options="clean skip-ui" ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done

check_java
case "$options" in *skip-ui) ;; *) check_node ;; esac
step "Cleaning and compiling"
# shellcheck disable=SC2086
build_runtime $options
success "Compiled from scratch."
