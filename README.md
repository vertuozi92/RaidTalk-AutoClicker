# RaidTalk AutoClicker

Windows desktop application built with Electron for working with RaidTalk in a multi-tab workspace.

## Version

**1.3.0 — 20 tabs**

## Features

- 20 browser tabs with independent settings
- Per-tab click interval and click coordinates
- Page point picker
- Yellow visual click indicator
- Dark page styling and reduced page animations
- Refresh current tab and refresh all tabs
- Settings stored locally by the application
- GitHub-based update channel configuration

## Requirements

- Windows 10/11 (64-bit)
- Node.js and npm for running from source
- Internet connection to load RaidTalk

## Run from source

```bash
npm install
npm start
```

## Build Windows installer

```bash
npm install
npm run dist
```

The installer is generated in the `release` directory.

## Project files

- `src/main.js` — Electron main process
- `src/preload.js` — secure bridge between Electron and UI
- `src/index.html` — application interface
- `src/renderer.js` — tabs, settings and clicker UI
- `package.json` — dependencies and build configuration

## Notes

This repository contains the application source. Do not commit personal credentials, local settings, `node_modules`, or generated installer files.

Use the application only with accounts and pages you are authorized to access. Automatic group rejoining must not bypass access controls or submit membership requests without the user's action.

## License

UNLICENSED — all rights reserved unless the repository owner states otherwise.
