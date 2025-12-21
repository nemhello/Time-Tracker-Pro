# Time Tracker PWA

Simple location-based time tracking app with charge codes for Navy reserve work.

## Features
- 11 pre-configured locations with charge codes
- Start/stop timer with running display
- Edit entry times manually
- View today's entries
- Export for timecard submission
- Works offline
- Installable as home screen app

## Files
- `index.html` - Main app interface
- `app.js` - Application logic
- `styles.css` - Mobile-optimized styling
- `locations.js` - **EDIT THIS to update charge codes**
- `manifest.json` - PWA config
- `service-worker.js` - Offline functionality
- `icon-192.png`, `icon-512.png` - App icons

## Deployment to GitHub Pages

1. Create new repository on GitHub (e.g., `time-tracker`)

2. Push files:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/time-tracker.git
   git push -u origin main
   ```

3. Enable GitHub Pages:
   - Go to repository Settings → Pages
   - Source: Deploy from branch
   - Branch: main / (root)
   - Save

4. Your app will be at: `https://YOUR_USERNAME.github.io/time-tracker/`

## Usage

### On iPhone:
1. Open app URL in Safari
2. Tap Share button (square with arrow)
3. Tap "Add to Home Screen"
4. App installs like native app

### Tracking Time:
1. Search or select location
2. Timer starts automatically
3. Tap STOP when done
4. Edit times if needed with ✎ button
5. Tap EXPORT to copy for timecard

### Updating Charge Codes:
1. Edit `locations.js` file
2. Change charge codes (format: SZ02B04D33)
3. Commit and push to GitHub
4. Users get update next time they open app

## Data Storage
- All data stored locally on each device
- No server/database needed
- Each user has independent tracking
- Clearing browser data erases entries

## Adding More Locations
Edit `locations.js`:
```javascript
const LOCATIONS = [
    { name: "Bennington", chargeCode: "SZ02B04D33" },
    { name: "New Location", chargeCode: "SZ02B04D99" },
    // Add more here
];
```

## Sharing with Coworkers
Just send them the GitHub Pages URL. They:
1. Open URL in browser
2. Add to home screen
3. Start tracking independently

No accounts, no server costs, no maintenance.
