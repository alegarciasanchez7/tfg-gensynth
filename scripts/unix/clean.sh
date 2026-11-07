#!/usr/bin/env bash
# Deletes what the builds generate. With --all it also deletes the data of the application run
# from the sources (state, logs, outputs, shared libraries and the downloaded browser).
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/clean.sh [--all] [--yes]

  --all   Also delete core/state, core/logs, core/outputs, core/lib/shared and core/jcef-bundle
          (installed plugins in core/plugins are kept)
  --yes   Do not ask for confirmation
USAGE
}

all=false
yes=false
while [ $# -gt 0 ]; do
    case "$1" in
        --all) all=true ;;
        --yes|-y) yes=true ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done

step "Deleting the build output"
check_java
mvnw -B -q clean -DskipUi=true
rm -rf "$UI_DIR/dist" "$UI_DIR/coverage" "$UI_DIR/reports" "$CORE_DIR/src/main/resources/ui"

if [ "$all" = true ]; then
    data="$CORE_DIR/state $CORE_DIR/logs $CORE_DIR/outputs $CORE_DIR/lib/shared $CORE_DIR/jcef-bundle"
    if [ "$yes" = false ]; then
        echo "This also deletes:"
        for dir in $data; do echo "  $dir"; done
        printf 'Continue? [y/N] '
        read -r answer
        case "$answer" in
            y|Y|yes|YES) ;;
            *) echo "Nothing else was deleted."; exit 0 ;;
        esac
    fi
    # shellcheck disable=SC2086
    rm -rf $data
fi
success "Clean."
