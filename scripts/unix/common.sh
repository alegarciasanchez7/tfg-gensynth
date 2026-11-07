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

# Prints the major version of a "java -version" output: 1.8.0 -> 8, 21.0.5 -> 21.
java_major() {
    local version
    version="$(java -version 2>&1 | sed -n 's/.*version "\([^"]*\)".*/\1/p' | head -n 1)"
    case "$version" in
        1.*) echo "$version" | cut -d. -f2 ;;
        *) echo "$version" | cut -d. -f1 | cut -d- -f1 | cut -d+ -f1 ;;
    esac
}

check_java() {
    command -v java >/dev/null 2>&1 || fail "Java was not found. Install JDK $MIN_JAVA or newer: https://adoptium.net/temurin/releases/?version=$MIN_JAVA"
    command -v javac >/dev/null 2>&1 || fail "javac was not found: a JRE is not enough, install JDK $MIN_JAVA or newer: https://adoptium.net/temurin/releases/?version=$MIN_JAVA"
    local major
    major="$(java_major)"
    case "$major" in
        ''|*[!0-9]*) warn "Could not read the Java version; JDK $MIN_JAVA or newer is needed." ;;
        *) [ "$major" -ge "$MIN_JAVA" ] || fail "Java $major found, but JDK $MIN_JAVA or newer is needed: https://adoptium.net/temurin/releases/?version=$MIN_JAVA" ;;
    esac
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
    echo "target/classes:../plugin-api/target/classes:../connectors/rabbitmq/target/classes:$DEV_LIB/*"
}

# Whether the running Java is the JetBrains Runtime, which bundles its own JCEF module.
is_jetbrains_runtime() {
    java -version 2>&1 | grep -qi "jbr\|jetbrains"
}
