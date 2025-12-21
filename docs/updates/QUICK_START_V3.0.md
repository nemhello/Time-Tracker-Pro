# v3.0 Quick Start

## What's New:

✅ **Calendar View** - Click "📅 View Past Entries" to see all past work with notes
✅ **Training Entry** - Miscellaneous category, no codes, skips email, just timer + notes  
✅ **Dual Codes** - Every location supports SZ and MOS codes (MOS empty for now)
✅ **Code Selection Modal** - Choose which code to use for each email

## Deploy Steps:

1. **Make repo private** (GitHub → Settings → Change visibility)
2. **Download 6 files** from `/mnt/user-data/outputs/`
3. **Replace in local folder**
4. **Commit & push** via GitHub Desktop
5. **Wait for Actions ✅**
6. **Delete app from phone**
7. **Clear Safari cache**
8. **Reinstall from Safari**

## Files to Update:

- app.js
- index.html  
- styles.css
- locations.js
- service-worker.js
- manifest.json

## Look For:

- "v3.0" at bottom of app
- "📅 View Past Entries" button (no more Export)
- "Training" in Miscellaneous category
- Modal when clicking email buttons

## Test:

1. Click Training → Should skip to timer immediately
2. Click any location → Email button → Modal shows codes
3. Complete an entry → View Past Entries → See it in calendar
4. Search "training" → Find it

## If Issues:

- Check all 6 files were replaced
- Hard refresh (Ctrl+Shift+R)
- Check console for errors
- Reinstall app completely

## Next Steps:

When you get MOS codes spreadsheet:
- Send it to me
- I'll update locations.js
- You replace just that one file
- MOS buttons become active

---

**Full details:** [V3.0_COMPLETE_UPDATE.md](computer:///mnt/user-data/outputs/V3.0_COMPLETE_UPDATE.md)

**MOS codes guide:** [ADDING_MOS_CODES.md](computer:///mnt/user-data/outputs/ADDING_MOS_CODES.md)
