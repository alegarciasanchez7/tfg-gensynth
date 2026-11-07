#!/usr/bin/env bash
# Builds the installers of this OS, as the release does: the full application in
# core/target/installer/dist and the CLI edition in core/target/installer/dist-cli.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
    cat <<USAGE
Usage: scripts/unix/package.sh [--skip-deb] [--skip-rpm]

  --skip-deb   Linux: no .deb (skipped on its own when dpkg-deb is missing)
  --skip-rpm   Linux: no .rpm (skipped on its own when rpmbuild is missing)
USAGE
}

options=()
skip_deb=false
skip_rpm=false
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-deb) skip_deb=true ;;
        --skip-rpm) skip_rpm=true ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done

check_java
check_node
if [ "$(uname -s)" = "Linux" ]; then
    if [ "$skip_deb" = false ] && ! command -v dpkg-deb >/dev/null 2>&1; then
        warn "dpkg-deb was not found: no .deb is built."
        skip_deb=true
    fi
    if [ "$skip_rpm" = false ] && ! command -v rpmbuild >/dev/null 2>&1; then
        warn "rpmbuild was not found: no .rpm is built."
        skip_rpm=true
    fi
    [ "$skip_deb" = false ] || options+=("-Dinstaller.skipDeb=true")
    [ "$skip_rpm" = false ] || options+=("-Dinstaller.skipRpm=true")
fi

step "Building the installers (mvnw -Dinstaller -DskipTests clean package)"
mvnw -B -Dinstaller -DskipTests ${options[@]+"${options[@]}"} clean package

step "Installers"
ls -1 "$CORE_DIR/target/installer/dist" "$CORE_DIR/target/installer/dist-cli"
