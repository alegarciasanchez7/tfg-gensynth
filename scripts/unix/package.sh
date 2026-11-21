#!/usr/bin/env bash
# Builds the GenSynth installers: the full application and/or the CLI edition, for this OS
# and/or the others. jpackage only builds installers for the OS it runs on, so the installers of
# this computer are built here (core/target/installer/dist and dist-cli) and the ones of the
# other systems on GitHub Actions (the Release workflow, which publishes nothing), and are then
# downloaded to core/target/installer/remote/. That needs the GitHub CLI (gh) and the branch
# pushed to GitHub. Run it without options to be asked what to do.
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

case "$(uname -s)" in
    Darwin) this_os=macos ;;
    *) this_os=linux ;;
esac

usage() {
    cat <<USAGE
Usage: scripts/unix/package.sh [--os this|linux|windows|macos|all] [--edition both|full|cli]
                               [--type all|deb|rpm]

  --os        Systems to build for, separated by commas (default: this, $this_os). The other
              systems are built on GitHub Actions and downloaded (needs gh and the branch pushed)
  --edition   both (default), full (the application) or cli (the CLI edition)
  --type      Linux built here: all (default), deb or rpm (skipped on their own when
              dpkg-deb or rpmbuild is missing)

Without options it asks what to do.
USAGE
}

# Name of a system as shown to the user.
os_name() {
    case "$1" in
        linux) echo "Linux" ;;
        windows) echo "Windows" ;;
        macos) echo "macOS" ;;
    esac
}

systems="this"
edition="both"
type="all"
if asks_options $#; then
    others=()
    for os in linux windows macos; do
        [ "$os" = "$this_os" ] || others+=("$os")
    done
    ask_choice "Installers for" 1 \
        "This computer ($(os_name "$this_os"))" \
        "$(os_name "${others[0]}") (built on GitHub Actions)" \
        "$(os_name "${others[1]}") (built on GitHub Actions)" \
        "Linux, Windows and macOS (the other two on GitHub Actions)"
    case "$CHOICE" in
        1) systems="this" ;;
        2) systems="${others[0]}" ;;
        3) systems="${others[1]}" ;;
        4) systems="all" ;;
    esac
    ask_choice "Edition" 1 "Both: the full application and the CLI edition" "The full application only" \
        "The CLI edition only (the command line, without the window)"
    case "$CHOICE" in
        2) edition="full" ;;
        3) edition="cli" ;;
    esac
    if [ "$this_os" = linux ] && { [ "$systems" = this ] || [ "$systems" = all ]; }; then
        ask_choice "Linux packages built here" 1 ".deb and .rpm" ".deb only (Debian, Ubuntu...)" \
            ".rpm only (Fedora, openSUSE...)"
        case "$CHOICE" in
            2) type="deb" ;;
            3) type="rpm" ;;
        esac
    fi
    show_command "scripts/unix/package.sh --os $systems --edition $edition --type $type"
fi
while [ $# -gt 0 ]; do
    case "$1" in
        --os|--edition|--type)
            [ $# -ge 2 ] || fail "$1 needs a value (see --help)"
            case "$1" in
                --os) systems="$2" ;;
                --edition) edition="$2" ;;
                --type) type="$2" ;;
            esac
            shift
            ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown option: $1" ;;
    esac
    shift
done

case "$edition" in both|full|cli) ;; *) fail "Unknown edition '$edition': use both, full or cli" ;; esac
case "$type" in all|deb|rpm) ;; *) fail "Unknown package type '$type': use all, deb or rpm" ;; esac

# Splits the systems into the one built here and the ones built on GitHub Actions
build_here=false
remote=""
for os in $(echo "$systems" | tr ',' ' '); do
    case "$os" in
        this) build_here=true ;;
        all) build_here=true; for other in linux windows macos; do [ "$other" = "$this_os" ] || remote="$remote,$other"; done ;;
        linux|windows|macos)
            if [ "$os" = "$this_os" ]; then build_here=true; else remote="$remote,$os"; fi
            ;;
        *) fail "Unknown system '$os': use this, linux, windows, macos or all" ;;
    esac
done
remote="$(echo "$remote" | tr ',' '\n' | sort -u | grep -v '^$' | paste -sd, - || true)"

cd "$REPO_ROOT"
run_id=""
destination=""
if [ -n "$remote" ]; then
    step "Building for $remote on GitHub Actions (jpackage only builds for the system it runs on)"
    command -v gh >/dev/null 2>&1 || fail "The GitHub CLI was not found. Install it (https://cli.github.com) and run: gh auth login"
    gh auth status >/dev/null 2>&1 || fail "The GitHub CLI is not logged in. Run: gh auth login"
    branch="$(git rev-parse --abbrev-ref HEAD)"
    git fetch -q origin "$branch" 2>/dev/null \
        || fail "Branch $branch is not on GitHub: push it first (git push -u origin $branch)."
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]; then
        warn "GitHub builds the last pushed commit of $branch, which is not the one you have here."
        if ! [ -t 0 ] || ! ask_yes_no "Build the pushed commit anyway" n; then
            fail "Push $branch first (git push) and run it again."
        fi
    fi
    [ -z "$(git status --porcelain)" ] || warn "Changes that are not committed and pushed are not in the GitHub build."
    previous="$(gh run list --workflow release.yml --branch "$branch" --event workflow_dispatch --limit 1 \
        --json databaseId --jq '.[0].databaseId // ""')"
    gh workflow run release.yml --ref "$branch" -f os="$remote" -f edition="$edition"
    for _ in $(seq 1 30); do
        run_id="$(gh run list --workflow release.yml --branch "$branch" --event workflow_dispatch --limit 1 \
            --json databaseId --jq '.[0].databaseId // ""')"
        [ -n "$run_id" ] && [ "$run_id" != "$previous" ] && break
        run_id=""
        sleep 2
    done
    [ -n "$run_id" ] || fail "The GitHub Actions run did not start: check the Actions tab of the repository."
    echo "Run $run_id: $(gh run view "$run_id" --json url --jq .url)"
    echo "It goes on while the installers of this computer are built."
fi

if [ "$build_here" = true ]; then
    check_java
    check_node
    options=()
    case "$edition" in
        full) options+=("-Dinstaller.skipCli=true" "-Dinstaller.skipCliDeb=true" "-Dinstaller.skipCliRpm=true") ;;
        cli) options+=("-Dinstaller.skipFull=true" "-Dinstaller.skipFullDeb=true" "-Dinstaller.skipFullRpm=true") ;;
    esac
    if [ "$this_os" = linux ]; then
        if [ "$type" = rpm ]; then
            options+=("-Dinstaller.skipDeb=true")
        elif ! command -v dpkg-deb >/dev/null 2>&1; then
            warn "dpkg-deb was not found: no .deb is built."
            options+=("-Dinstaller.skipDeb=true")
        fi
        if [ "$type" = deb ]; then
            options+=("-Dinstaller.skipRpm=true")
        elif ! command -v rpmbuild >/dev/null 2>&1; then
            warn "rpmbuild was not found: no .rpm is built."
            options+=("-Dinstaller.skipRpm=true")
        fi
    fi
    step "Building the installers of this computer (mvnw -Dinstaller -DskipTests clean package)"
    mvnw -B -Dinstaller -DskipTests ${options[@]+"${options[@]}"} clean package
fi

if [ -n "$run_id" ]; then
    step "Waiting for the GitHub Actions run $run_id"
    gh run watch "$run_id" --exit-status \
        || fail "The GitHub Actions run failed: $(gh run view "$run_id" --json url --jq .url)"
    destination="$CORE_DIR/target/installer/remote/run-$run_id"
    rm -rf "$destination"
    gh run download "$run_id" --dir "$destination" --pattern 'installers-*'
fi

step "Installers"
for dir in "$CORE_DIR/target/installer/dist" "$CORE_DIR/target/installer/dist-cli" ${destination:+"$destination"}; do
    [ -d "$dir" ] && find "$dir" -type f \( -name '*.msi' -o -name '*.deb' -o -name '*.rpm' -o -name '*.dmg' -o -name '*.pkg' \)
done
exit 0
