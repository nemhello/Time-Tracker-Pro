# BACKUP/RESTORE WORKFLOW

## The Problem You Had:
Delete app from home screen → All notes/entries disappear

## The Solution:
Export before deleting, Import after reinstalling

---

## NEW WORKFLOW FOR UPDATES:

### Step 1: BEFORE Deleting Old App
```
1. Open current app
2. Click "💾 Export Backup"
3. File downloads to your phone
4. ✓ Data is safe
```

### Step 2: Update & Reinstall
```
1. Delete app from home screen
2. Update files in GitHub
3. Wait for deployment ✅
4. Add app to home screen again
```

### Step 3: AFTER Reinstalling
```
1. Open fresh app (empty)
2. Click "📂 Import Backup"
3. Select your backup file
4. Confirm
5. ✓ All entries restored!
```

---

## What You Need to Do NOW:

1. **Add buttons to index.html** (see BUTTONS_TO_ADD.html)
2. **Replace app.js** with the new one
3. **Deploy this update**
4. **From now on:** Always export before updating!

---

## Files to Deploy:
- ✓ app.js (already updated with export/import functions)
- ⚠️ index.html (you need to add the two buttons)

## Button Location in HTML:
Find where "View Past Entries" button is, add Export and Import buttons right after it.

---

**After this update, you'll never lose data again!**
