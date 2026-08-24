# CodeForge

A fast, minimal desktop code editor with a custom Zed-inspired workspace.

## Stack

- Tauri 2 + Rust
- React + TypeScript
- Vite
- Monaco Editor

## Current v1 foundation

- Native desktop shell
- Custom CodeForge workspace UI
- Open a local project folder
- Recursive project explorer with common generated folders hidden
- Open real text files in Monaco
- Language detection for common file types
- Multiple editor tabs
- Real file saving with `Ctrl+S`
- Modified-file indicators
- Native filesystem permissions scoped to the user's home directory
- Subtle motion with reduced-motion support

## Development

Install dependencies with pnpm, then run:

```powershell
pnpm install
pnpm tauri dev
```

For a production frontend build:

```powershell
pnpm build
```

Tauri's Windows development prerequisites must be installed on the machine running the app.
