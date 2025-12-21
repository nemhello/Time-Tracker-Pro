# Final Update - Clean Address Handling

## Changes Made:

✓ All 93 locations imported with real charge codes
✓ Removed "Add address here" placeholders - addresses are now empty by default
✓ Addresses only show when you actually add them
✓ Export no longer includes addresses (cleaner output)

## Categories in Your App:

1. **Tower Sites** - 43 locations
2. **Police Stations** - 12 locations
3. **Fire Stations** - 3 locations
4. **General Dispatch** - 35 locations

## Export Format (Clean):

```
TIME CARD - Sunday, December 08, 2025

Location: Bennington RF Sub-Site
Start: 08:30
Stop: 12:45

Location: KCI RF Sub-Site
Start: 14:00
Stop: 17:30
Notes: Checked equipment
```

Simple and clean - just location, times, and notes if any.

## How to Update:

### Using GitHub Desktop:

1. Download these 2 files:
   - [locations.js](computer:///mnt/user-data/outputs/locations.js) - all 93 locations
   - [app.js](computer:///mnt/user-data/outputs/app.js) - clean export

2. Replace old files in your local time-tracker folder

3. Open **GitHub Desktop**

4. Commit message: "Import all locations, clean up addresses"

5. Click **"Commit to main"**

6. Click **"Push origin"**

7. Live in 30 seconds!

## Adding Addresses Later (Optional):

If you want Apple Maps links for some locations, edit `locations.js`:

```javascript
{ name: "Bennington RF Sub-Site", chargeCode: "SZ02B040107", address: "123 Main St, KC, MO 64101" },
```

The address will:
- Show in active timer (tappable to open Maps)
- NOT show in location list (keeps it clean)
- NOT show in entry cards (stays minimal)
- NOT show in export (as requested)

You can add addresses for just the locations you visit often.

Done!
