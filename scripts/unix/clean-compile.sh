#!/usr/bin/env bash
# Deletes the previous build (mvnw clean) and compiles every module from scratch.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/clean-compile.sh [--skip-ui]

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
step "Cleaning and compiling"
# shellcheck disable=SC2086
build_runtime clean $options
success "Compiled from scratch."
