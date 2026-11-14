# Shared helpers of the GenSynth development scripts for Linux and macOS.
# Sourced by the other scripts, never run on its own. Written for bash 3.2 (the macOS default):
# no associative arrays, no ${var,,} and no mapfile.

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPTS_DIR/../.." && pwd)"
CORE_DIR="$REPO_ROOT/core"
UI_DIR="$REPO_ROOT/ui"
MIN_JAVA=21
MIN_NODE=20
# Runtime libraries of the core, copied on every build so a stale or missing folder never
# breaks a run (VS Code may rebuild core/target on its own)
DEV_LIB="target/dev-lib"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
    C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BOLD=""; C_RESET=""
fi

step()    { printf '%s==> %s%s\n' "$C_BLUE$C_BOLD" "$*" "$C_RESET"; }
success() { printf '%s%s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn()    { printf '%sWarning:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
fail()    { printf '%sError:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

# --- Questions -------------------------------------------------------------------------------
# A script run without options from a terminal asks what to do; with options (or with its input
# redirected, as in the CI) it uses them and asks nothing.

# Whether to ask the options: no options were given ($1 is the number of options) and both the
# input and the output are a terminal. GENSYNTH_ASK=1 asks with any input (the CI answers through
# a pipe).
asks_options() {
    [ "$1" -eq 0 ] && { [ -n "${GENSYNTH_ASK:-}" ] || { [ -t 0 ] && [ -t 1 ]; }; }
}

# Asks a yes/no question; Enter takes the default. Returns 0 for yes.
# Arguments: the question, the default (y or n).
ask_yes_no() {
    local hint answer
    if [ "$2" = y ]; then hint="[Y/n]"; else hint="[y/N]"; fi
    while true; do
        printf '%s%s?%s %s ' "$C_BOLD" "$1" "$C_RESET" "$hint"
        read -r answer || answer=""
        case "$answer" in
            "") [ "$2" = y ]; return ;;
            y|Y|yes|YES|s|S|si|SI) return 0 ;;
            n|N|no|NO) return 1 ;;
            *) echo "Answer y (yes) or n (no)." ;;
        esac
    done
}

# Asks to pick one option by its number; Enter takes the default. Sets CHOICE (1, 2...).
# Arguments: the question, the number of the default option, then the options.
ask_choice() {
    local question="$1" default="$2" answer i
    shift 2
    printf '%s%s:%s
' "$C_BOLD" "$question" "$C_RESET"
    i=1
    for option in "$@"; do
        printf '  %d) %s
' "$i" "$option"
        i=$((i + 1))
    done
    while true; do
        printf 'Choose 1-%d [%s]: ' "$#" "$default"
        read -r answer || answer=""
        answer="${answer:-$default}"
        case "$answer" in
            ''|*[!0-9]*) ;;
            *)
                if [ "$answer" -ge 1 ] && [ "$answer" -le $# ]; then
                    # shellcheck disable=SC2034 # read by the scripts that ask
                    CHOICE="$answer"
                    return
                fi
                ;;
        esac
        echo "Type a number from 1 to $#."
    done
}

# Asks for a free text; Enter leaves it empty. Sets ANSWER.
ask_text() {
    printf '%s%s:%s ' "$C_BOLD" "$1" "$C_RESET"
    # shellcheck disable=SC2034 # read by the scripts that ask
    read -r ANSWER || ANSWER=""
}

# After the questions, shows the command that does the same without asking.
# Arguments: the script and its options.
show_command() {
    printf '%s(next time, without questions: %s)%s\n' "$C_BLUE" "$*" "$C_RESET"
}

# --- Build ----------------------------------------------------------------------------------

# Runs the Maven wrapper of the repository (never a global mvn), from the repository root.
mvnw() {
    (cd "$REPO_ROOT" && sh ./mvnw "$@")
}

# Prints the major version in a Java version string: 1.8.0 -> 8, 21.0.5 -> 21 (nothing if it is
# not a number).
version_major() {
    local major
    case "$1" in
        1.*) major="$(echo "$1" | cut -d. -f2)" ;;
        *) major="$(echo "$1" | cut -d. -f1 | cut -d- -f1 | cut -d+ -f1)" ;;
    esac
    case "$major" in
        ''|*[!0-9]*) ;;
        *) echo "$major" ;;
    esac
}

# Prints the major version of the java on the PATH (nothing when there is none).
java_major() {
    command -v java >/dev/null 2>&1 || return 0
    version_major "$(java -version 2>&1 | sed -n 's/.*version "\([^"]*\)".*/\1/p' | head -n 1)"
}

# A path as the shell uses it: on Windows (Git Bash) JAVA_HOME is written as C:\..., which
# would break the PATH, whose separator is ":".
unix_path() {
    if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else echo "$1"; fi
}

# Prints the major version of the JDK in the folder $1, read from its "release" file, or nothing
# when the folder is not a JDK (a JRE has no javac).
jdk_major() {
    { [ -x "$1/bin/javac" ] || [ -x "$1/bin/javac.exe" ]; } || return 0
    { [ -x "$1/bin/java" ] || [ -x "$1/bin/java.exe" ]; } || return 0
    [ -f "$1/release" ] || return 0
    version_major "$(tr -d '\r' < "$1/release" | sed -n 's/^JAVA_VERSION="\(.*\)"$/\1/p' | head -n 1)"
}

# Prints the oldest JDK $MIN_JAVA or newer found in the folders where the usual installers put
# it (the closest to the JDK of the CI: a newer one may break tests, as JDK 25 does with Mockito),
# or nothing. Linux: the system packages (/usr/lib/jvm), Oracle's RPM (/usr/java) and /opt.
# macOS: java_home, the installers (/Library/Java/JavaVirtualMachines) and Homebrew. Both, and
# Windows with Git Bash: SDKMAN!, asdf, mise and the JDKs downloaded by IntelliJ IDEA.
find_jdk() {
    local candidates=() root dir major best="" best_major=
    if [ -x /usr/libexec/java_home ]; then
        dir="$(/usr/libexec/java_home -v "$MIN_JAVA+" 2>/dev/null || true)"
        [ -z "$dir" ] || candidates+=("$dir")
    fi
    for root in /usr/lib/jvm /usr/java /opt /opt/java /opt/jdk \
            "$HOME/.sdkman/candidates/java" "$HOME/.asdf/installs/java" \
            "$HOME/.local/share/mise/installs/java" "$HOME/.jdks"; do
        for dir in "$root"/*; do [ -d "$dir" ] && candidates+=("$dir"); done
    done
    for root in /Library/Java/JavaVirtualMachines "$HOME/Library/Java/JavaVirtualMachines"; do
        for dir in "$root"/*/Contents/Home; do [ -d "$dir" ] && candidates+=("$dir"); done
    done
    for root in /opt/homebrew/opt /usr/local/opt /home/linuxbrew/.linuxbrew/opt; do
        for dir in "$root"/openjdk*/libexec/openjdk.jdk/Contents/Home "$root"/openjdk*/libexec; do
            [ -d "$dir" ] && candidates+=("$dir")
        done
    done
    if [ -n "${PROGRAMFILES:-}" ] && command -v cygpath >/dev/null 2>&1; then
        local program_files
        program_files="$(cygpath -u "$PROGRAMFILES")"
        for root in Java "Eclipse Adoptium" "Eclipse Foundation" Microsoft Zulu "Amazon Corretto" BellSoft Semeru; do
            for dir in "$program_files/$root"/*; do [ -d "$dir" ] && candidates+=("$dir"); done
        done
    fi
    for dir in ${candidates[@]+"${candidates[@]}"}; do
        major="$(jdk_major "$dir")"
        [ -n "$major" ] && [ "$major" -ge "$MIN_JAVA" ] || continue
        [ -z "$best_major" ] || [ "$major" -lt "$best_major" ] || continue
        best="$dir"
        best_major="$major"
    done
    [ -z "$best" ] || echo "$best"
}

check_java() {
    # The JDK of JAVA_HOME (the one the Maven wrapper uses) goes first on the PATH, ahead of an
    # older Java that an installer may have put at the front (such as Oracle's "javapath")
    if [ -n "${JAVA_HOME:-}" ]; then
        local java_home
        java_home="$(unix_path "$JAVA_HOME")"
        if [ -x "$java_home/bin/java" ] || [ -x "$java_home/bin/java.exe" ]; then
            PATH="$java_home/bin:$PATH"
            export PATH
        fi
    fi
    local major
    major="$(java_major)"
    if [ -n "$major" ] && [ "$major" -ge "$MIN_JAVA" ] && command -v javac >/dev/null 2>&1; then
        return 0
    fi
    # No JDK new enough on the PATH nor in JAVA_HOME: look for one in the usual install folders
    # and use it as JAVA_HOME (so the Maven wrapper takes it too), only while the script runs
    local found
    found="$(find_jdk)"
    if [ -n "$found" ]; then
        found="$(unix_path "$found")"
        JAVA_HOME="$found"
        PATH="$found/bin:$PATH"
        export JAVA_HOME PATH
        echo "Using the JDK $(jdk_major "$found") found in $found (set JAVA_HOME to choose another one)"
        return 0
    fi
    command -v java >/dev/null 2>&1 || fail "Java was not found. Install JDK $MIN_JAVA or newer: https://adoptium.net/temurin/releases/?version=$MIN_JAVA"
    command -v javac >/dev/null 2>&1 || fail "javac was not found: a JRE is not enough, install JDK $MIN_JAVA or newer: https://adoptium.net/temurin/releases/?version=$MIN_JAVA"
    if [ -z "$major" ]; then
        warn "Could not read the Java version; JDK $MIN_JAVA or newer is needed."
        return 0
    fi
    fail "Java $major found, but JDK $MIN_JAVA or newer is needed: https://adoptium.net/temurin/releases/?version=$MIN_JAVA (if it is already installed somewhere else, set JAVA_HOME to its folder)"
}

check_node() {
    command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install Node.js $MIN_NODE or newer (https://nodejs.org), or use --skip-ui."
    command -v npm >/dev/null 2>&1 || fail "npm was not found. Install Node.js $MIN_NODE or newer (https://nodejs.org), or use --skip-ui."
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    [ "$major" -ge "$MIN_NODE" ] || fail "Node.js $major found, but $MIN_NODE or newer is needed (https://nodejs.org), or use --skip-ui."
}

# Installs the UI dependencies when they are missing.
ensure_ui_dependencies() {
    if [ ! -d "$UI_DIR/node_modules" ]; then
        step "Installing the UI dependencies (npm ci)"
        (cd "$UI_DIR" && npm ci)
    fi
}

# Compiles every module and copies the runtime libraries of the core to core/target/dev-lib.
# Arguments: "clean" to start from scratch, "skip-ui" to keep the UI bundle already built,
# then any extra Maven option.
build_runtime() {
    local goals="" options=""
    while [ $# -gt 0 ]; do
        case "$1" in
            clean) goals="clean" ;;
            skip-ui) options="$options -DskipUi=true" ;;
            *) options="$options $1" ;;
        esac
        shift
    done
    rm -rf "${CORE_DIR:?}/$DEV_LIB"
    # The modules of this repository (plugin API, RabbitMQ) go on the classpath as their
    # compiled classes, so the libraries copied are only the external ones
    # shellcheck disable=SC2086
    mvnw -B $goals compile dependency:copy-dependencies $options \
        -DincludeScope=runtime -DexcludeGroupIds=com.gensynth \
        -DoutputDirectory="$DEV_LIB"
}

# Whether the core must be compiled before it can run: its classes or its libraries are missing
# (after a clean, or when VS Code rebuilt core/target).
needs_build() {
    [ ! -d "$CORE_DIR/target/classes" ] || [ ! -d "$CORE_DIR/$DEV_LIB" ] \
        || [ ! -d "$REPO_ROOT/plugin-api/target/classes" ]
}

# Classpath of the core, relative to core/ (where the application must start in development).
runtime_classpath() {
    # The Java of Windows (Git Bash) separates the classpath with ";", the others with ":"
    local sep=":"
    case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) sep=";" ;; esac
    echo "target/classes${sep}../plugin-api/target/classes${sep}../connectors/rabbitmq/target/classes${sep}$DEV_LIB/*"
}

# Whether the running Java is the JetBrains Runtime, which bundles its own JCEF module.
is_jetbrains_runtime() {
    java -version 2>&1 | grep -qi "jbr\|jetbrains"
}
