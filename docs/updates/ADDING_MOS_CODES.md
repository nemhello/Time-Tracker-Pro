# Adding MOS Codes Later

## When You Get the MOS Codes Spreadsheet:

### Step 1: Send Me the File
Upload the MOS codes spreadsheet (Excel or CSV format)

### Step 2: I'll Update locations.js
I'll match each location to its MOS code and update the file

### Step 3: You Deploy
Replace just locations.js and push to GitHub

## Example of What Changes:

**Before (current):**
```javascript
{
  name: "Bennington RF Sub-Site",
  chargeCodeSZ: "SZ02B040107",
  chargeCodeMOS: "",  // Empty
  address: "..."
}
```

**After (with MOS codes):**
```javascript
{
  name: "Bennington RF Sub-Site",
  chargeCodeSZ: "SZ02B040107",
  chargeCodeMOS: "MOS12345",  // Populated!
  address: "..."
}
```

## What This Enables:

**Code Selection Modal - Both Buttons Active:**
```
Which code to use?

[SZ Code]           ← Enabled
SZ02B040107

[MOS Code]          ← NOW ENABLED!
MOS12345

[Cancel]
```

## Expected File Format:

Ideally, the MOS spreadsheet should have:
- Column 1: Location name (matching exactly)
- Column 2: MOS code

Or:
- Column 1: SZ code
- Column 2: MOS code

Either way works - I'll match them up!

## Questions to Answer When You Get MOS Codes:

1. Do ALL 92 locations have MOS codes?
2. Or just some?
3. Is Training included? (probably not)

## One-File Update:

When MOS codes are ready:
1. I update locations.js
2. You replace just that one file
3. Push to GitHub
4. Reinstall app
5. Modal buttons now show both codes!

**Easy upgrade path - the app is already built for it!**
