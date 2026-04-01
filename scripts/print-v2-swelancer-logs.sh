#!/usr/bin/env bash
# Print SWE-Lancer per-issue logs (pytest, npm, mitm, etc.) to stdout for GitHub Actions job logs.
# Usage: scripts/print-v2-swelancer-logs.sh [.v2-swelancer-logs]
set -uo pipefail

ROOT="${1:-.v2-swelancer-logs}"

echo "::group::v2 SWE-Lancer host logs (${ROOT})"
if [[ ! -d "$ROOT" ]]; then
    echo "Directory not found: ${ROOT}"
    echo "::endgroup::"
    exit 0
fi

mapfile -t files < <(find "$ROOT" -type f 2>/dev/null | sort || true)
if [[ ${#files[@]} -eq 0 ]]; then
    echo "No files under ${ROOT}"
    echo "::endgroup::"
    exit 0
fi

echo "Files:"
printf '  %s\n' "${files[@]}"

for f in "${files[@]}"; do
    echo ""
    echo "======== ${f} ========"
    case "$f" in
        *pytest.log)
            tail -n 1000 "$f" 2>/dev/null || echo "(read failed)"
            ;;
        *)
            sz=$(wc -c <"$f" 2>/dev/null || echo 0)
            if [[ "$sz" -gt 25000 ]]; then
                echo "(file ${sz} bytes — showing last 150 lines)"
                tail -n 150 "$f" 2>/dev/null || true
            else
                cat "$f" 2>/dev/null || true
            fi
            ;;
    esac
done
echo "::endgroup::"
