# Update Guide - Address & Notes Features

## New Features Added:

✓ **Address per location** - Tappable to open Apple Maps
✓ **Notes field** - Add notes while timer is running
✓ Notes auto-save as you type
✓ Address & notes show in entry cards
✓ Address & notes included in export

## What You'll See:

**When tracking:**
- Address shown as clickable link (📍)
- Tap to open in Apple Maps
- Notes textarea to add context
- Notes saved automatically

**In entries:**
- Address shown as clickable link
- Notes displayed below time info
- Everything included in export

## How to Update:

### Using GitHub Desktop:

1. Download these 4 files:
   - [locations.js](computer:///mnt/user-data/outputs/locations.js)
   - [app.js](computer:///mnt/user-data/outputs/app.js)
   - [index.html](computer:///mnt/user-data/outputs/index.html)
   - [styles.css](computer:///mnt/user-data/outputs/styles.css)

2. Replace old files in your local time-tracker folder

3. Open GitHub Desktop

4. Commit message: "Add address and notes features"

5. Click "Commit to main"

6. Click "Push origin"

7. Live in ~30 seconds!

## Add Real Addresses:

Edit `locations.js` - replace "Add address here":

```javascript
{ 
    name: "Bennington", 
    chargeCode: "SZ02B04D33", 
    address: "1234 Main St, Kansas City, MO 64101" 
},
```

Use full addresses with city and state for best Apple Maps results.

## Using the New Features:

1. **Tap location** to start timer
2. **See address** - tap to open in Maps
3. **Add notes** - type anything relevant
4. Notes auto-save as you type
5. **Tap STOP** when done
6. See address & notes in entry
7. **Export** includes everything

Perfect for tracking what you did at each location!
