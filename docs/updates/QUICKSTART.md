# Quick Start - Deploy to GitHub Pages

## Step 1: Update Charge Codes (Optional Now, Required Later)
Edit `locations.js` and replace placeholder codes with real ones:
```javascript
{ name: "Bennington", chargeCode: "YOUR_REAL_CODE" },
```

## Step 2: Create GitHub Repository
1. Go to github.com
2. Click "New repository"
3. Name it: `time-tracker` (or whatever you want)
4. Keep it Public
5. Don't initialize with README
6. Click "Create repository"

## Step 3: Push Your Files
In your terminal (from the folder with these files):
```bash
git init
git add .
git commit -m "Navy time tracker app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/time-tracker.git
git push -u origin main
```

## Step 4: Enable GitHub Pages
1. Go to your repo on GitHub
2. Click "Settings" (top right)
3. Click "Pages" (left sidebar)
4. Under "Source": select "main" branch
5. Click "Save"
6. Wait 1-2 minutes

## Step 5: Your App is Live!
URL will be: `https://YOUR_USERNAME.github.io/time-tracker/`

## Share with Coworkers
Just send them the URL. They open it on iPhone and "Add to Home Screen".

## Update Locations Later
1. Edit `locations.js` on GitHub (or locally and push)
2. Changes go live immediately
3. Users get update next time they open app

---

**Need Help?**
- All data stored on device only
- No backend needed
- Free forever
- Works offline after first load
