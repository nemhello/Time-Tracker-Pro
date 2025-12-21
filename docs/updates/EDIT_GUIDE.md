# ADD MANUAL TIME EDITING

## What This Does:
Lets you click "Edit" on any entry to adjust start/end times. Perfect for rounding times!

## Example Use:
```
Original Entry:
Start: 08:47
End: 12:23
Duration: 3h 36m

Click "Edit" → Round to:
Start: 08:45
End: 12:30
Duration: 3h 45m
```

## How to Add:

### Step 1: Update app.js

Open your app.js file and:

**A. Add the editEntry() function**
- Copy function from EDIT_TIME_FEATURE.js
- Paste after your `deleteEntry()` function
- This handles the edit prompts and validation

**B. Update renderEntries() function**
- Find where you create entry cards
- Replace with the version from EDIT_TIME_FEATURE.js
- Key change: adds Edit button next to delete button

### Step 2: Update styles.css

Add these CSS rules:
```css
.entry-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}

.btn-edit {
    padding: 6px 12px;
    background: #007aff;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 500;
}

.btn-edit:hover {
    background: #0051d5;
}

.btn-edit:active {
    background: #004bb8;
}
```

### Step 3: Deploy

1. Update app.js and styles.css
2. Commit: "Add manual time editing"
3. Push to GitHub
4. Wait for Actions ✅
5. Clear cache and reload

## How to Use Edit Feature:

### Time Format Rules:
- **24-hour format:** HH:MM
- **Examples:** 08:30, 14:45, 23:15
- **Need leading zero:** 08:00 NOT 8:00

### Edit Process:
1. Click "Edit" button on entry
2. First prompt: Enter new start time (08:45)
3. Second prompt: Enter new end time (12:30)
4. Click OK → Times update instantly

### Validation:
- End must be after start
- Hours: 0-23
- Minutes: 0-59
- Invalid entries rejected with error message

## Troubleshooting:

**"Edit button not showing"**
- Check renderEntries() has the Edit button code
- Check CSS is deployed
- Clear cache

**"Invalid format error"**
- Use 24-hour format: 14:30 not 2:30 PM
- Include leading zero: 08:00 not 8:00
- Use colon: 08:30 not 08.30

**"End must be after start"**
- Check you didn't swap start/end times
- Make sure times are on same day

## Testing:

1. Create test entry (or use existing)
2. Note original times (e.g., 10:23 - 14:17)
3. Click Edit
4. Enter rounded times (10:30 - 14:15)
5. Verify:
   - Times updated in display
   - Duration recalculated correctly
   - Entry saved (refresh page to confirm)

---

**Files to edit:**
- app.js (add editEntry function + update renderEntries)
- styles.css (add .entry-actions and .btn-edit styles)

**Code reference:** EDIT_TIME_FEATURE.js
