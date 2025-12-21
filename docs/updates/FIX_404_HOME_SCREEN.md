# FIX: 404 When Adding to Home Screen

## The Problem:
Browser works fine, but "Add to Home Screen" gives 404.

## The Cause:
manifest.json has wrong paths for GitHub Pages.

## The Fix:

### Step 1: Check Your URL

Look at your working browser URL. Is it:
- `https://yourusername.github.io/time-tracker/` 
- OR `https://yourusername.github.io/`

### Step 2: Update manifest.json

**If URL is:** `https://yourusername.github.io/time-tracker/`

Change these lines in manifest.json:
```json
"start_url": "/time-tracker/",
"scope": "/time-tracker/",
```

**If URL is:** `https://yourusername.github.io/`

Change these lines in manifest.json:
```json
"start_url": "/",
"scope": "/",
```

The key: **start_url must match your actual URL path!**

### Step 3: Deploy

1. Update manifest.json with correct path
2. Commit: "Fix home screen 404 - correct start_url"
3. Push to GitHub
4. Wait for Actions ✅
5. Delete app from phone (if already added)
6. Clear Safari cache
7. Add to home screen again

## Quick Test:

After deploying, before adding to home screen:
1. Open app in Safari
2. Check URL matches start_url
3. Then add to home screen

---

**Most common mistake:** Repo name is "time-tracker" but start_url is "/" instead of "/time-tracker/"
