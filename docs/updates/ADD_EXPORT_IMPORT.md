# ADD EXPORT/IMPORT DATA BACKUP

## What This Does:
Before deleting the app to update, you can:
1. **Export** - Download a backup JSON file with all your entries
2. **Import** - After reinstalling, upload that file to restore everything

## Step 1: Update app.js
✓ Already done - download the new app.js file

## Step 2: Add Buttons to index.html

Find the section with "View Past Entries" button. It probably looks like:

```html
<button id="viewPastBtn" class="btn-secondary">
    📅 View Past Entries
</button>
```

**Add these two buttons right after it:**

```html
<button id="viewPastBtn" class="btn-secondary">
    📅 View Past Entries
</button>

<!-- ADD THESE TWO BUTTONS -->
<button id="exportDataBtn" class="btn-secondary">
    💾 Export Backup
</button>

<button id="importDataBtn" class="btn-secondary">
    📂 Import Backup
</button>
```

## Step 3: Add CSS (Optional Styling)

If you want, add this to styles.css to make them stand out:

```css
#exportDataBtn {
    background: #34c759;
    color: white;
}

#exportDataBtn:hover {
    background: #2da84a;
}

#importDataBtn {
    background: #007aff;
    color: white;
}

#importDataBtn:hover {
    background: #0051d5;
}
```

## How to Use:

### Before Updating:
1. Open app
2. Click "💾 Export Backup"
3. File downloads: `time-tracker-backup-2024-12-11.json`
4. Keep this file safe!

### After Reinstalling:
1. Open fresh app
2. Click "📂 Import Backup"
3. Select your backup file
4. Confirm import
5. ✓ All entries restored!

## What Gets Backed Up:
- All time entries (location, times, codes, notes)
- Export date/timestamp
- App version

## What Doesn't Get Backed Up:
- Active timer (if running)
- App settings
- Service worker cache

## Deploy:
1. Update index.html with new buttons
2. Update app.js
3. Commit: "Add export/import backup feature"
4. Push
5. For THIS update, export first, then reinstall!

---

**Pro tip:** Export regularly, not just before updates!
