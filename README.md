# ModSync

A compact Tauri desktop manager for local modded game instances.

## Development

Install dependencies and start the desktop application:

```sh
bun install
bun run dev
```

Frontend-only development is available with `bun run dev:vite`. Provider discovery requires the desktop application.

## CurseForge

CurseForge discovery requires a developer API key. Set `CURSEFORGE_API_KEY` when building or running the Rust application:

```sh
CURSEFORGE_API_KEY=your-key bun run dev
```

On PowerShell:

```powershell
$env:CURSEFORGE_API_KEY = 'your-key'
bun run dev
```

The key is read from the runtime environment or embedded from the build environment. It is not stored in instance or application manifests.

## Verification

```sh
bun run lint
bun run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Provider smoke tests require network access and are ignored by default:

```sh
cargo test --manifest-path src-tauri/Cargo.toml providers:: -- --ignored
```
