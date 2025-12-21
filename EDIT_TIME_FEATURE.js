// ==== ADD THIS EDIT FUNCTIONALITY TO YOUR app.js ====

// 1. ADD THIS FUNCTION (put it after deleteEntry function):

function editEntry(entryId) {
    const entries = getEntries();
    const entry = entries.find(e => e.id === entryId);
    
    if (!entry) return;
    
    const start = new Date(entry.startTime);
    const end = new Date(entry.endTime);
    
    // Format current times for display
    const startStr = start.toTimeString().slice(0, 5); // HH:MM
    const endStr = end.toTimeString().slice(0, 5);
    
    // Prompt for new times
    const newStart = prompt(
        `Edit start time (24-hour format):\nCurrent: ${startStr}\n\nEnter new time (HH:MM):`,
        startStr
    );
    
    if (!newStart) return; // Cancelled
    
    const newEnd = prompt(
        `Edit end time (24-hour format):\nCurrent: ${endStr}\n\nEnter new time (HH:MM):`,
        endStr
    );
    
    if (!newEnd) return; // Cancelled
    
    // Validate format (HH:MM)
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    
    if (!timeRegex.test(newStart) || !timeRegex.test(newEnd)) {
        alert('Invalid time format. Use HH:MM (24-hour)\nExample: 08:30 or 14:45');
        return;
    }
    
    // Parse new times
    const [startHour, startMin] = newStart.split(':').map(Number);
    const [endHour, endMin] = newEnd.split(':').map(Number);
    
    // Create new Date objects
    const newStartDate = new Date(start);
    newStartDate.setHours(startHour, startMin, 0, 0);
    
    const newEndDate = new Date(end);
    newEndDate.setHours(endHour, endMin, 0, 0);
    
    // Validate end is after start
    if (newEndDate <= newStartDate) {
        alert('End time must be after start time');
        return;
    }
    
    // Update entry
    entry.startTime = newStartDate.toISOString();
    entry.endTime = newEndDate.toISOString();
    
    saveEntries(entries);
    renderEntries();
    updateTotalHours();
}


// 2. UPDATE YOUR renderEntries FUNCTION:
// Find where you create entry cards and add the Edit button

function renderEntries() {
    const list = document.getElementById('entries-list');
    const todayEntries = getTodayEntries();
    
    if (todayEntries.length === 0) {
        list.innerHTML = '<div class="empty-state">No entries for today</div>';
        return;
    }
    
    list.innerHTML = todayEntries.map(entry => {
        const start = new Date(entry.startTime);
        const end = new Date(entry.endTime);
        const duration = end - start;
        
        return `
            <div class="entry-card">
                <div class="entry-header">
                    <div class="entry-location">${entry.location}</div>
                    <div class="entry-actions">
                        <button class="btn-edit" onclick="editEntry(${entry.id})">Edit</button>
                        <button class="btn-delete" onclick="deleteEntry(${entry.id})">×</button>
                    </div>
                </div>
                ${entry.chargeCodeSZ ? `<div class="entry-code">${entry.chargeCodeSZ}</div>` : ''}
                <div class="entry-time">
                    ${start.toTimeString().slice(0, 5)} - ${end.toTimeString().slice(0, 5)}
                </div>
                <div class="entry-duration">${formatDuration(duration)}</div>
                ${entry.notes ? `<div class="entry-notes">${entry.notes}</div>` : ''}
            </div>
        `;
    }).join('');
}


// 3. ADD TO YOUR CSS (styles.css):

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
