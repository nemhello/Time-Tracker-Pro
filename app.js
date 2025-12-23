const CONFIG = { apiUrl: 'https://api.wilkerson-labs.com' };
let authToken = localStorage.getItem('authToken');
let authExpiry = localStorage.getItem('authExpiry');
let locationPhotos = {}, currentLocationPhotos = [], photoViewMode = false;

// State
let entries = [];
let activeEntry = null;
let timerInterval = null;
let selectedCategory = null;
let selectedLocation = null;
let pendingCodeSelection = null;
let currentCalendarDate = new Date();

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const isAuth = await checkAuthentication();
    if (!isAuth) await showLoginPrompt();
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
    loadPhotos();
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

function loadPhotos() {
    const stored = localStorage.getItem('locationPhotos');
    locationPhotos = stored ? JSON.parse(stored) : {};
}

function savePhotos() {
    localStorage.setItem('locationPhotos', JSON.stringify(locationPhotos));
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

// Location List - WITH PHOTO COUNTS
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
    
    list.innerHTML = locations.map(loc => {
        const photoCount = getLocationPhotos(loc.name).length;
        const photoIndicator = photoCount > 0 ? ` 📸 ${photoCount}` : '';
        
        return `
        <div class="location-item" onclick="showLocationDetails('${escapeHtml(loc.name)}', '${escapeHtml(loc.chargeCodeSZ)}', '${escapeHtml(loc.chargeCodeMOS)}', '${escapeHtml(loc.address || '')}', '${escapeHtml(selectedCategory)}')">
            <div class="loc-name">${loc.name}${photoIndicator}</div>
            <div class="loc-code">${loc.chargeCodeSZ || 'No code'}</div>
            ${loc.address && loc.address.trim() !== '' ? `<div class="loc-address">${loc.address}</div>` : ''}
        </div>
    `;
    }).join('');
}

// Location Details - WITH PHOTO BUTTON
function showLocationDetails(name, chargeCodeSZ, chargeCodeMOS, address, category) {
    selectedLocation = { name, chargeCodeSZ, chargeCodeMOS, address, category };
    currentLocationPhotos = getLocationPhotos(name);
    photoViewMode = false;
    
    if (name === 'Training') {
        confirmStartTimer();
        return;
    }
    
    document.getElementById('locationSelection').classList.add('hidden');
    document.getElementById('globalSearchSection').classList.add('hidden');
    document.getElementById('categorySelection').classList.add('hidden');
    document.getElementById('locationDetails').classList.remove('hidden');
    
    renderLocationDetailsView();
}

function renderLocationDetailsView() {
    if (!selectedLocation) return;
    
    const photoCount = currentLocationPhotos.length;
    const lastVisit = getLastVisitDate(selectedLocation.name);
    
    document.getElementById('detailsLocation').textContent = selectedLocation.name;
    document.getElementById('detailsChargeCode').textContent = selectedLocation.chargeCodeSZ || 'No charge code';
    
    const addressDiv = document.getElementById('detailsAddress');
    if (selectedLocation.address && selectedLocation.address.trim() !== '') {
        addressDiv.innerHTML = `<a href="https://maps.apple.com/?q=${encodeURIComponent(selectedLocation.address)}" target="_blank">📍 ${selectedLocation.address}</a>`;
        addressDiv.style.display = 'block';
    } else {
        addressDiv.style.display = 'none';
    }
    
    const buttonsDiv = document.querySelector('#locationDetails .details-buttons');
    if (buttonsDiv) {
        let html = '';
        
        if (authToken && photoCount > 0) {
            html += `<button class="btn-primary" onclick="togglePhotoView()">📸 View Photos (${photoCount})</button>`;
        } else if (authToken) {
            html += `<button class="btn-primary" onclick="togglePhotoView()">📷 Add Photos</button>`;
        }
        
        html += `
            <button class="btn-secondary" onclick="emailDispatchStart()">📧 Email Dispatch</button>
            <button class="btn-primary" onclick="confirmStartTimer()">▶️ Start Timer</button>
        `;
        
        if (lastVisit && photoCount > 0) {
            html = `<div class="photo-info-banner">Last visit: ${lastVisit} • ${photoCount} photo${photoCount !== 1 ? 's' : ''}</div>` + html;
        }
        
        buttonsDiv.innerHTML = html;
    }
}

function getLastVisitDate(locationName) {
    const locationEntries = entries.filter(e => e.location === locationName);
    if (locationEntries.length === 0) return null;
    
    locationEntries.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    const lastEntry = locationEntries[0];
    const date = new Date(lastEntry.startTime);
    
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';