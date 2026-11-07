#!/usr/bin/env bash
# Compiles every module and leaves the core ready to run (no tests, no packages).
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/compile.sh [--skip-ui]

  --skip-ui   Keep the React UI already built instead of building it again
USAGE
}

options=""
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-ui) options="skip-ui" ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done

check_java
[ -n "$options" ] || check_node
step "Compiling"
# shellcheck disable=SC2086
build_runtime $options
success "Compiled."
