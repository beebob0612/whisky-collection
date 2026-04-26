# Danny's Collection

Personal whiskey collection tracker PWA.

## Features
- Add/edit/delete bottles with name, location, notes
- Track Opened/Finished dates with calendar picker
- Strikethrough display for finished bottles
- Search by name, location, or notes
- Filter by location, sort by name or date added
- Duplicate detection on add
- JSON backup/restore via menu (top-right)
- Full offline support via service worker
- Add-to-home-screen for native app feel

## Deployment

Deploy to Vercel:
1. Push this repo to GitHub
2. Import to Vercel (vercel.com) — auto-detects Vite
3. Deploy

## Local development

```
npm install
npm run dev
```

## Build

```
npm run build
```

## Data storage

All data stored in browser localStorage on the device. Use Export
in the menu to back up to a JSON file (save to iCloud / Drive / email).
