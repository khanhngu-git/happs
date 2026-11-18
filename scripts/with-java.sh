#!/bin/sh
# The Firebase emulators need Java 21+. Homebrew's openjdk is keg-only, so put
# it on PATH if it exists and no java is already available.
if ! java -version >/dev/null 2>&1; then
  for d in /opt/homebrew/opt/openjdk@21/bin /opt/homebrew/opt/openjdk/bin /usr/local/opt/openjdk@21/bin; do
    if [ -x "$d/java" ]; then PATH="$d:$PATH"; export PATH; break; fi
  done
fi
exec "$@"
