#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

version="$(
  python3 -c 'import json; print(json.load(open("plugin/manifest.json", encoding="utf-8"))["version"])'
)"
dist_dir="$repository_root/dist"
build_stage="$(mktemp -d "${TMPDIR:-/tmp}/psd-optimizer-build.XXXXXX")"
trap 'rm -rf -- "$build_stage"' EXIT INT TERM

mkdir -p "$dist_dir"

node_bin="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "$node_bin" ]]; then
  printf 'Node.js was not found. Install Node.js or set NODE_BIN.\n' >&2
  exit 1
fi

go test ./...
"$node_bin" tests/verify-ui-behavior.cjs
python3 -m json.tool plugin/manifest.json >/dev/null
cmp LICENSE plugin/LICENSE

source_archive="$build_stage/PSD-Optimizer.zip"
(
  cd plugin
  zip -X -q -r "$source_archive" .
)
unzip -tqq "$source_archive"

source_output="$dist_dir/PSD-Optimizer-${version}-source.zip"
install -m 0644 "$source_archive" "$source_output"

artifacts=("$source_output")

if command -v pkgbuild >/dev/null 2>&1; then
  package_scripts="$build_stage/pkg-scripts"
  cp -R packaging/macos/scripts "$package_scripts"
  mkdir -p "$package_scripts/payload"
  install -m 0644 "$source_archive" "$package_scripts/payload/PSD-Optimizer.zip"
  chmod 0755 "$package_scripts/postinstall"

  pkg_output="$dist_dir/PSD-Optimizer-${version}-macOS.pkg"
  COPYFILE_DISABLE=1 pkgbuild \
    --nopayload \
    --scripts "$package_scripts" \
    --identifier cn.caveman.psdoptimizer.installer \
    --version "$version" \
    "$pkg_output"
  artifacts+=("$pkg_output")
fi

llvm_rc="${LLVM_RC:-$(command -v llvm-rc || true)}"
llvm_cvtres="${LLVM_CVTRES:-$(command -v llvm-cvtres || true)}"
if [[ -n "$llvm_rc" && -n "$llvm_cvtres" ]]; then
  resource_file="$build_stage/installer-${version}.res"
  "$llvm_rc" /fo "$resource_file" installer.rc
  "$llvm_cvtres" \
    /machine:x64 \
    "/out:$repository_root/resource_windows_amd64.syso" \
    "$resource_file"

  exe_output="$dist_dir/PSD-Optimizer-${version}-Windows-x64.exe"
  GOOS=windows GOARCH=amd64 go build \
    -trimpath \
    -ldflags="-H windowsgui -s -w" \
    -o "$exe_output" .
  artifacts+=("$exe_output")
else
  printf 'Skipping Windows EXE: llvm-rc and llvm-cvtres were not found.\n'
fi

checksum_file="$dist_dir/SHA256SUMS.txt"
: >"$checksum_file"
for artifact in "${artifacts[@]}"; do
  shasum -a 256 "$artifact" | sed "s|  $dist_dir/|  |" >>"$checksum_file"
done

printf 'PSD Optimizer %s release files are ready in %s\n' "$version" "$dist_dir"
