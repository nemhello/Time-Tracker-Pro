// State
let entries = [];
let activeEntry = null;
let timerInterval = null;
let selectedCategory = null;
let selectedLocation = null;
let pendingCodeSelection = null;
let currentCalendarDate = new Date();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (typeof CATEGORIES === 'undefined') {
        console.error('CRITICAL: CATEGORIES not loaded!');
        alert('ERROR: Location data failed to load. Please refresh.');
        return;
    }
    console.log('✓ CATEGORIES loaded:', Object.keys(CATEGORIES).length, 'categories');
    
    setTimeout(() => {
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.classList.add('hidden');
        
        const searchResults = document.getElementById('globalSearchResults');
        if (searchResults) {
            searchResults.classList.add('hidden');
            searchResults.innerHTML = '';
        }
    }, 100);
    
    loadEntries();
    renderCategories();
    renderEntries();
    updateCurrentDate();
    setupEventListeners();
    checkActiveEntry();
});

// Storage
function loadEntries() {
    const stored = localStorage.getItem('timeEntries');
    entries = stored ? JSON.parse(stored) : [];
    
    const active = localStorage.getItem('activeEntry');
    activeEntry = active ? JSON.parse(active) : null;
}

function saveEntries() {
    localStorage.setItem('timeEntries', JSON.stringify(entries));
}

function saveActiveEntry() {
    if (activeEntry) {
        localStorage.setItem('activeEntry', JSON.stringify(activeEntry));
    } else {
        localStorage.removeItem('activeEntry');
    }
}

// Global Search
function handleGlobalSearch(searchTerm) {
    const results = document.getElementById('globalSearchResults');
    const categoryList = document.getElementById('categoryList');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    if (!searchTerm || searchTerm.trim() === '') {
        results.classList.add('hidden');
        results.innerHTML = '';
        categoryList.style.display = 'grid';
        clearBtn.classList.add('hidden');
        return;
    }
    
    categoryList.style.display = 'none';
    results.classList.remove('hidden');
    clearBtn.classList.remove('hidden');
    
    if (typeof CATEGORIES === 'undefined') {
        results.innerHTML = '<div class="no-entries">ERROR: Location data not loaded</div>';
        return;
    }
    
    const allMatches = [];
    const term = searchTerm.toLowerCase().trim();
    
    for (const [categoryName, locations] of Object.entries(CATEGORIES)) {
        if (!Array.isArray(locations)) continue;
        
        const matches = locations.filter(loc => {
            if (!loc || !loc.name) return false;
            return loc.name.toLowerCase().includes(term) ||
                   (loc.chargeCodeSZ && loc.chargeCodeSZ.toLowerCase().includes(term)) ||
                   (loc.chargeCodeMOS && loc.chargeCodeMOS.toLowerCase().includes(term));
        });
        
        matches.forEach(loc => {
            allMatches.push({
                name: loc.name,
                chargeCodeSZ: loc.chargeCodeSZ,
                chargeCodeMOS: loc.chargeCodeMOS,
                address: loc.address || '',
                category: categoryName
            });
        });
    }
    
    if (allMatches.length === 0) {
        results.innerHTML = '<div class="no-entries">No locations found</div>';
        return;
    }
    
    results.innerHTML = allMatches.map(loc => `
        <div class="location-item" onclick="showLocationDetails('${escapeHtml(loc.name)}', '${escapeHtml(loc.chargeCodeSZ)}', '${escapeHtml(loc.chargeCodeMOS)}', '${escapeHtml(loc.address)}', '${escapeHtml(loc.category)}')">
            <div class="loc-name">${loc.name}</div>
            <div class="loc-code">${loc.chargeCodeSZ || 'No code'}</div>
            <div class="loc-category">${loc.category}</div>
        </div>
    `).join('');
}

function clearSearch() {
    document.getElementById('globalSearchBox').value = '';
    document.getElementById('globalSearchResults').innerHTML = '';
    document.getElementById('globalSearchResults').classList.add('hidden');
    document.getElementById('categoryList').style.display = 'grid';
    document.getElementById('clearSearchBtn').classList.add('hidden');
}

// Categories
function renderCategories() {
    const list = document.getElementById('categoryList');
    list.innerHTML = Object.keys(CATEGORIES).map(cat => `
        <div class="category-card" onclick="selectCategory('${escapeHtml(cat)}')">
            <div class="category-name">${cat}</div>
            <div class="category-count">${CATEGORIES[cat].length} locations</div>
        </div>
    `).join('');
}

function selectCategory(category) {
    selectedCategory = category;
    document.getElementById('globalSearchSection').classList.add('hidden');
    document.getElementById('categorySelection').classList.add('hidden');
    document.getElementById('locationSelection').classList.remove('hidden');
    renderLocationList();
}

function backToCategories() {
    selectedCategory = null;
    document.getElementById('globalSearchBox').value = '';
    document.getElementById('globalSearchResults').innerHTML = '';
    document.getElementById('globalSearchResults').classList.add('hidden');
    document.getElementById('categoryList').style.display = 'grid';
    document.getElementById('locationSelection').classList.add('hidden');
    document.getElementById('globalSearchSection').classList.remove('hidden');
    document.getElementById('categorySelection').classList.remove('hidden');
}

// Location List
function renderLocationList() {
    const list = document.getElementById('locationList');
    
    if (!selectedCategory) {
        list.innerHTML = '';
        return;
    }
    
    const locations = CATEGORIES[selectedCategory] || [];
    
    if (locations.length === 0) {
        list.innerHTML = '<div class="no-entries">No locations</div>';
        return;
    }
    
    list.innerHTML = locations.map(loc => `
        <div class="location-item" onclick="showLocationDetails('${escapeHtml(loc.name)}', '${escapeHtml(loc.chargeCodeSZ)}', '${escapeHtml(loc.chargeCodeMOS)}', '${escapeHtml(loc.address || '')}', '${escapeHtml(selectedCategory)}')">
            <div class="loc-name">${loc.name}</div>
            <div class="loc-code">${loc.chargeCodeSZ || 'No code'}</div>
            ${loc.address && loc.address.trim() !== '' ? `<div class="loc-address">${loc.address}</div>` : ''}
        </div>
    `).join('');
}

// Location Details
function showLocationDetails(name, chargeCodeSZ, chargeCodeMOS, address, category) {
    selectedLocation = { name, chargeCodeSZ, chargeCodeMOS, address, category };
    
    // Training goes straight to timer
    if (name === 'Training') {
        confirmStartTimer();
        return;
    }
    
    document.getElementById('locationSelection').classList.add('hidden');
    document.getElementById('globalSearchSection').classList.add('hidden');
    document.getElementById('categorySelection').classList.add('hidden');
    document.getElementById('locationDetails').classList.remove('hidden');
    
    document.getElementById('detailsLocation').textContent = name;
    document.getElementById('detailsChargeCode').textContent = chargeCodeSZ || 'No charge code';
    
    const addressDiv = document.getElementById('detailsAddress');
    if (address && address.trim() !== '') {
        addressDiv.innerHTML = `<a href="https://maps.apple.com/?q=${encodeURIComponent(address)}" target="_blank">📍 ${address}</a>`;
        addressDiv.style.display = 'block';
    } else {
        addressDiv.style.display = 'none';
    }
}

function backFromDetails() {
    selectedLocation = null;
    document.getElementById('locationDetails').classList.add('hidden');
    
    if (selectedCategory) {
        document.getElementById('locationSelection').classList.remove('hidden');
    } else {
        document.getElementById('globalSearchSection').classList.remove('hidden');
        document.getElementById('categorySelection').classList.remove('hidden');
    }
}

// Email & Code Modal
function emailDispatchStart() {
    if (!selectedLocation) return;
    if (selectedLocation.name === 'Training') return;
    
    showCodeModal('start');
}

function showCodeModal(action) {
    const modal = document.getElementById('codeModal');
    const szBtn = document.getElementById('useSZCode');
    const mosBtn = document.getElementById('useMOSCode');
    const szValue = document.getElementById('szCodeValue');
    const mosValue = document.getElementById('mosCodeValue');
    
    szValue.textContent = selectedLocation.chargeCodeSZ || 'Not available';
    mosValue.textContent = selectedLocation.chargeCodeMOS || 'Not available';
    
    szBtn.disabled = !selectedLocation.chargeCodeSZ;
    mosBtn.disabled = !selectedLocation.chargeCodeMOS;
    
    pendingCodeSelection = action;
    modal.classList.remove('hidden');
}

function hideCodeModal() {
    document.getElementById('codeModal').classList.add('hidden');
    pendingCodeSelection = null;
}

function handleCodeSelection(codeType) {
    const code = codeType === 'SZ' ? selectedLocation.chargeCodeSZ : selectedLocation.chargeCodeMOS;
    if (!code) return;
    
    const action = pendingCodeSelection;
    hideCodeModal();
    
    if (action === 'start') {
        sendStartEmail(code);
    } else if (action === 'stop') {
        sendStopEmail(code);
        // Finish entry right after sending email
        setTimeout(() => {
            finishEntry();
        }, 300);
    }
}

function sendStartEmail(code) {
    const subject = code;
    const body = `Please open a ticket to start work at ${selectedLocation.name}`;
    window.location.href = `mailto:dispatch@motorolasolutions.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function sendStopEmail(code) {
    const subject = code;
    const body = `All work at ${selectedLocation.name} is finished, please close this ticket.`;
    window.location.href = `mailto:dispatch@motorolasolutions.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Timer
function confirmStartTimer() {
    if (!selectedLocation) return;
    
    const now = new Date();
    activeEntry = {
        id: now.getTime(),
        location: selectedLocation.name,
        chargeCodeSZ: selectedLocation.chargeCodeSZ,
        chargeCodeMOS: selectedLocation.chargeCodeMOS,
        address: selectedLocation.address,
        startTime: now.toISOString(),
        endTime: null,
        notes: ''
    };
    
    saveActiveEntry();
    showActiveTimer();
    startTimer();
}

function showActiveTimer() {
    document.getElementById('locationDetails').classList.add('hidden');
    document.getElementById('locationSelection').classList.add('hidden');
    document.getElementById('globalSearchSection').classList.add('hidden');
    document.getElementById('categorySelection').classList.add('hidden');
    document.getElementById('activeTimer').classList.remove('hidden');
    
    document.getElementById('activeLocation').textContent = activeEntry.location;
    
    const chargeCodeDiv = document.getElementById('activeChargeCode');
    if (activeEntry.chargeCodeSZ) {
        chargeCodeDiv.textContent = activeEntry.chargeCodeSZ;
        chargeCodeDiv.style.display = 'block';
    } else {
        chargeCodeDiv.style.display = 'none';
    }
    
    const addressLink = document.getElementById('activeAddress');
    if (activeEntry.address && activeEntry.address.trim() !== '') {
        addressLink.href = `https://maps.apple.com/?q=${encodeURIComponent(activeEntry.address)}`;
        addressLink.textContent = `📍 ${activeEntry.address}`;
        addressLink.style.display = 'block';
    } else {
        addressLink.style.display = 'none';
    }
    
    document.getElementById('workOrderField').value = activeEntry.workOrder || '';
    document.getElementById('notesField').value = activeEntry.notes || '';
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const start = new Date(activeEntry.startTime);
        const now = new Date();
        const diff = now - start;
        
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        document.getElementById('timerDisplay').textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    if (!activeEntry) return;
    
    // STOP THE CLOCK IMMEDIATELY
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // Set end time now
    activeEntry.endTime = new Date().toISOString();
    activeEntry.workOrder = document.getElementById('workOrderField').value.trim();
    activeEntry.notes = document.getElementById('notesField').value;
    
    // Training finishes immediately
    if (activeEntry.location === 'Training') {
        entries.push(activeEntry);
        saveEntries();
        activeEntry = null;
        saveActiveEntry();
        hideActiveTimer();
        renderEntries();
        return;
    }
    
    // Set selectedLocation from activeEntry for modal
    selectedLocation = {
        name: activeEntry.location,
        chargeCodeSZ: activeEntry.chargeCodeSZ,
        chargeCodeMOS: activeEntry.chargeCodeMOS,
        address: activeEntry.address
    };
    
    // Show modal for stop email
    showCodeModal('stop');
}

function finishEntry() {
    // Timer already stopped in stopTimer()
    // activeEntry already has endTime and notes set
    
    // Save the entry
    entries.push(activeEntry);
    saveEntries();
    
    activeEntry = null;
    saveActiveEntry();
    
    hideActiveTimer();
    renderEntries();
}

function hideActiveTimer() {
    document.getElementById('activeTimer').classList.add('hidden');
    document.getElementById('todaySection').classList.remove('hidden');
    document.getElementById('globalSearchSection').classList.remove('hidden');
    document.getElementById('categorySelection').classList.remove('hidden');
    selectedCategory = null;
    selectedLocation = null;
}

function checkActiveEntry() {
    if (activeEntry) {
        showActiveTimer();
        startTimer();
    }
}

// Entries
function renderEntries() {
    const list = document.getElementById('entriesList');
    const today = new Date().toDateString();
    
    const todayEntries = entries.filter(e => {
        return new Date(e.startTime).toDateString() === today;
    });
    
    if (todayEntries.length === 0) {
        list.innerHTML = '<div class="no-entries">No entries today</div>';
        document.getElementById('totalHours').textContent = '';
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
                        <button class="btn-edit" onclick="editEntry(${entry.id})">Edit Time</button>
                        <button class="btn-edit" onclick="editDetails(${entry.id})">Details</button>
                        <button class="btn-delete" onclick="deleteEntry(${entry.id})">×</button>
                    </div>
                </div>
                ${entry.chargeCodeSZ ? `<div class="entry-code">${entry.chargeCodeSZ}</div>` : ''}
                ${entry.workOrder ? `<div class="entry-workorder">WO #${entry.workOrder}</div>` : ''}
                <div class="entry-time">${formatTime(start)} - ${formatTime(end)}</div>
                <div class="entry-duration">${formatDuration(duration)}</div>
                ${entry.notes ? `<div class="entry-notes">📝 ${entry.notes}</div>` : ''}
            </div>
        `;
    }).join('');
    
    const totalMs = todayEntries.reduce((sum, e) => {
        return sum + (new Date(e.endTime) - new Date(e.startTime));
    }, 0);
    
    document.getElementById('totalHours').innerHTML = `
        <div class="total-hours">Total: ${formatDuration(totalMs)}</div>
    `;
}

function deleteEntry(id) {
    if (confirm('Delete this entry?')) {
        entries = entries.filter(e => e.id !== id);
        saveEntries();
        renderEntries();
    }
}

function editEntry(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    
    const start = new Date(entry.startTime);
    const end = new Date(entry.endTime);
    
    const startStr = start.toTimeString().slice(0, 5);
    const endStr = end.toTimeString().slice(0, 5);
    
    const newStart = prompt(
        `Edit start time (24-hour format):\nCurrent: ${startStr}\n\nEnter new time (HH:MM):`,
        startStr
    );
    
    if (!newStart) return;
    
    const newEnd = prompt(
        `Edit end time (24-hour format):\nCurrent: ${endStr}\n\nEnter new time (HH:MM):`,
        endStr
    );
    
    if (!newEnd) return;
    
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    
    if (!timeRegex.test(newStart) || !timeRegex.test(newEnd)) {
        alert('Invalid time format. Use HH:MM (24-hour)\nExample: 08:30 or 14:45');
        return;
    }
    
    const [startHour, startMin] = newStart.split(':').map(Number);
    const [endHour, endMin] = newEnd.split(':').map(Number);
    
    const newStartDate = new Date(start);
    newStartDate.setHours(startHour, startMin, 0, 0);
    
    const newEndDate = new Date(end);
    newEndDate.setHours(endHour, endMin, 0, 0);
    
    if (newEndDate <= newStartDate) {
        alert('End time must be after start time');
        return;
    }
    
    entry.startTime = newStartDate.toISOString();
    entry.endTime = newEndDate.toISOString();
    
    saveEntries();
    renderEntries();
}

function editDetails(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    
    const currentWO = entry.workOrder || '';
    const currentNotes = entry.notes || '';
    
    const newWO = prompt(
        `Edit Work Order # for ${entry.location}:\n\n(Leave blank if none)`,
        currentWO
    );
    
    // User clicked Cancel on work order
    if (newWO === null) return;
    
    const newNotes = prompt(
        `Edit notes for ${entry.location}:\n\n(Leave blank to remove notes)`,
        currentNotes
    );
    
    // User clicked Cancel on notes
    if (newNotes === null) return;
    
    // Save both fields
    entry.workOrder = newWO.trim();
    entry.notes = newNotes.trim();
    
    saveEntries();
    renderEntries();
}

// Calendar
function showCalendar() {
    document.getElementById('todaySection').classList.add('hidden');
    document.getElementById('globalSearchSection').classList.add('hidden');
    document.getElementById('categorySelection').classList.add('hidden');
    document.getElementById('calendarView').classList.remove('hidden');
    renderCalendar();
}

function hideCalendar() {
    document.getElementById('calendarView').classList.add('hidden');
    document.getElementById('todaySection').classList.remove('hidden');
    document.getElementById('globalSearchSection').classList.remove('hidden');
    document.getElementById('categorySelection').classList.remove('hidden');
    document.getElementById('pastEntriesDetail').classList.add('hidden');
}

function renderCalendar() {
    const container = document.getElementById('calendarContainer');
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const datesWithEntries = new Set();
    entries.forEach(entry => {
        const date = new Date(entry.startTime);
        if (date.getFullYear() === year && date.getMonth() === month) {
            datesWithEntries.add(date.getDate());
        }
    });
    
    let html = `
        <div class="calendar-nav">
            <button onclick="previousMonth()">← Previous</button>
            <div class="calendar-month-header">${monthNames[month]} ${year}</div>
            <button onclick="nextMonth()">Next →</button>
        </div>
        <div class="calendar-month">
    `;
    
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    for (let i = 0; i < startingDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = (day === today.getDate() && month === today.getMonth() && year === today.getFullYear());
        const hasEntries = datesWithEntries.has(day);
        
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (hasEntries) classes += ' has-entries';
        
        html += `<div class="${classes}" onclick="showDateEntries(${year}, ${month}, ${day})">${day}</div>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function previousMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

function showDateEntries(year, month, day) {
    const targetDate = new Date(year, month, day);
    const dateString = targetDate.toDateString();
    
    const dateEntries = entries.filter(e => {
        return new Date(e.startTime).toDateString() === dateString;
    });
    
    if (dateEntries.length === 0) return;
    
    const detailDiv = document.getElementById('pastEntriesDetail');
    const titleDiv = document.getElementById('selectedDateTitle');
    const entriesDiv = document.getElementById('selectedDateEntries');
    
    titleDiv.textContent = targetDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    entriesDiv.innerHTML = dateEntries.map(entry => {
        const start = new Date(entry.startTime);
        const end = new Date(entry.endTime);
        const duration = end - start;
        
        return `
            <div class="entry-card">
                <div class="entry-header">
                    <div class="entry-location">${entry.location}</div>
                </div>
                ${entry.chargeCodeSZ ? `<div class="entry-code">${entry.chargeCodeSZ}</div>` : ''}
                ${entry.workOrder ? `<div class="entry-workorder">WO #${entry.workOrder}</div>` : ''}
                <div class="entry-time">${formatTime(start)} - ${formatTime(end)}</div>
                <div class="entry-duration">${formatDuration(duration)}</div>
                ${entry.notes ? `<div class="entry-notes">📝 ${entry.notes}</div>` : ''}
            </div>
        `;
    }).join('');
    
    detailDiv.classList.remove('hidden');
}

// Event Listeners
function setupEventListeners() {
    document.getElementById('globalSearchBox').addEventListener('input', (e) => {
        handleGlobalSearch(e.target.value);
    });
    
    document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
    document.getElementById('backBtn').addEventListener('click', backToCategories);
    document.getElementById('backFromDetailsBtn').addEventListener('click', backFromDetails);
    document.getElementById('backFromCalendarBtn').addEventListener('click', hideCalendar);
    
    document.getElementById('emailStartBtn').addEventListener('click', emailDispatchStart);
    document.getElementById('startTimerBtn').addEventListener('click', confirmStartTimer);
    document.getElementById('stopBtn').addEventListener('click', stopTimer);
    
    document.getElementById('viewPastBtn').addEventListener('click', showCalendar);
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', importData);
    
    document.getElementById('useSZCode').addEventListener('click', () => handleCodeSelection('SZ'));
    document.getElementById('useMOSCode').addEventListener('click', () => handleCodeSelection('MOS'));
    document.getElementById('skipEmailBtn').addEventListener('click', skipEmailAndFinish);
    document.getElementById('cancelCodeModal').addEventListener('click', hideCodeModal);
    
    const workOrderField = document.getElementById('workOrderField');
    if (workOrderField) {
        workOrderField.addEventListener('input', (e) => {
            if (activeEntry) {
                activeEntry.workOrder = e.target.value.trim();
                saveActiveEntry();
            }
        });
    }
    
    const notesField = document.getElementById('notesField');
    if (notesField) {
        notesField.addEventListener('input', (e) => {
            if (activeEntry) {
                activeEntry.notes = e.target.value;
                saveActiveEntry();
            }
        });
    }
}

function skipEmailAndFinish() {
    const action = pendingCodeSelection;  // Save before clearing!
    hideCodeModal();
    if (action === 'stop') {
        finishEntry();
    }
}

function updateCurrentDate() {
    const dateDiv = document.getElementById('currentDate');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDiv.textContent = new Date().toLocaleDateString('en-US', options);
}

// Export/Import Data
function exportData() {
    const data = {
        entries: entries,
        exportDate: new Date().toISOString(),
        version: 'v3.0.2'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `time-tracker-backup-${date}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    alert(`✓ Backup saved: ${filename}\n\nKeep this file safe! Import it after reinstalling the app.`);
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                if (!data.entries || !Array.isArray(data.entries)) {
                    alert('❌ Invalid backup file');
                    return;
                }
                
                const confirmMsg = `Import ${data.entries.length} entries?\n\nThis will REPLACE your current data.\n\nBackup exported: ${new Date(data.exportDate).toLocaleString()}`;
                
                if (confirm(confirmMsg)) {
                    entries = data.entries;
                    saveEntries();
                    renderEntries();
                    alert(`✓ Imported ${entries.length} entries successfully!`);
                }
            } catch (err) {
                alert('❌ Error reading backup file: ' + err.message);
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

// Utilities
function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

function formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
