# QUICK FIX: Manual Time Edit

## What You Get:

Each entry shows:
```
┌────────────────────────────────┐
│ Tower Park        [Edit]  [×]  │  ← Edit + Delete buttons
│ SZ02B04...                     │
│ 08:45 - 12:30                  │
│ 3h 45m                         │
└────────────────────────────────┘
```

## To Add Edit Button:

### 1. In app.js - Add after deleteEntry():

```javascript
function editEntry(entryId) {
    const entries = getEntries();
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    
    const start = new Date(entry.startTime);
    const end = new Date(entry.endTime);
    const startStr = start.toTimeString().slice(0, 5);
    const endStr = end.toTimeString().slice(0, 5);
    
    const newStart = prompt(`Edit start time:\nCurrent: ${startStr}\n\nNew time (HH:MM):`, startStr);
    if (!newStart) return;
    
    const newEnd = prompt(`Edit end time:\nCurrent: ${endStr}\n\nNew time (HH:MM):`, endStr);
    if (!newEnd) return;
    
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(newStart) || !timeRegex.test(newEnd)) {
        alert('Invalid format. Use HH:MM (24-hour)');
        return;
    }
    
    const [startHour, startMin] = newStart.split(':').map(Number);
    const [endHour, endMin] = newEnd.split(':').map(Number);
    
    const newStartDate = new Date(start);
    newStartDate.setHours(startHour, startMin, 0, 0);
    
    const newEndDate = new Date(end);
    newEndDate.setHours(endHour, endMin, 0, 0);
    
    if (newEndDate <= newStartDate) {
        alert('End time must be after start');
        return;
    }
    
    entry.startTime = newStartDate.toISOString();
    entry.endTime = newEndDate.toISOString();
    
    saveEntries(entries);
    renderEntries();
    updateTotalHours();
}
```

### 2. In renderEntries() - Update entry card HTML:

Find this:
```javascript
<div class="entry-header">
    <div class="entry-location">${entry.location}</div>
    <button class="btn-delete" onclick="deleteEntry(${entry.id})">×</button>
</div>
```

Replace with:
```javascript
<div class="entry-header">
    <div class="entry-location">${entry.location}</div>
    <div class="entry-actions">
        <button class="btn-edit" onclick="editEntry(${entry.id})">Edit</button>
        <button class="btn-delete" onclick="deleteEntry(${entry.id})">×</button>
    </div>
</div>
```

### 3. In styles.css - Add:

```css
.entry-actions {
    display: flex;
    gap: 8px;
}

.btn-edit {
    padding: 6px 12px;
    background: #007aff;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
}
```

## Deploy & Test:

1. Update files
2. Commit + Push
3. Clear cache
4. Click Edit on entry
5. Enter: 08:45 then 12:30
6. Done!

**Time format:** 24-hour (08:30 not 8:30am)
