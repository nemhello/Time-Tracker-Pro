let photoDB = null;
let currentLocationPhotos = [], photoViewMode = false;
let photoCountsCache = null;

// IndexedDB init
function initPhotoDB() {
    return new Promise((resolve) => {
        let resolved = false;
        const req = indexedDB.open('TimeTrackerPhotos', 3);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            let store;
            if (!db.objectStoreNames.contains('photos')) {
                store = db.createObjectStore('photos', { keyPath: 'id' });
            } else {
                store = req.transaction.objectStore('photos');
            }
            if (!store.indexNames.contains('by_location')) {
                store.createIndex('by_location', 'location', { unique: false });
            }
            if (!db.objectStoreNames.contains('backups')) {
                db.createObjectStore('backups', { keyPath: 'date' });
            }
        };
        req.onblocked = () => {
            console.warn('IndexedDB upgrade blocked - continuing without DB');
            if (!resolved) { resolved = true; resolve(); }
        };
        req.onsuccess = e => { photoDB = e.target.result; if (!resolved) { resolved = true; resolve(); } };
        req.onerror = () => { console.error('IndexedDB error:', req.error); if (!resolved) { resolved = true; resolve(); } };
        // Timeout fallback - don't let DB issues block the app
        setTimeout(() => { if (!resolved) { resolved = true; console.warn('IndexedDB timed out'); resolve(); } }, 3000);
    });
}

// State
let entries = [];
let activeEntry = null;
let timerInterval = null;
let selectedCategory = null;
let selectedLocation = null;
let currentCalendarDate = new Date();
let addressOverrides = {};
let lastViewedDate = null;
let searchDebounceTimer = null;

function persistPhotoState() {
    if (selectedLocation) sessionStorage.setItem('photoLocation', JSON.stringify(selectedLocation));
    sessionStorage.setItem('photoViewMode', photoViewMode ? '1' : '0');
    if (selectedCategory) sessionStorage.setItem('photoCategory', selectedCategory);
}

function restorePhotoState() {
    const loc = sessionStorage.getItem('photoLocation');
    const mode = sessionStorage.getItem('photoViewMode');
    const cat = sessionStorage.getItem('photoCategory');
    if (loc) { selectedLocation = JSON.parse(loc); sessionStorage.removeItem('photoLocation'); }
    if (mode !== null) { photoViewMode = mode === '1'; sessionStorage.removeItem('photoViewMode'); }
    if (cat) { selectedCategory = cat; sessionStorage.removeItem('photoCategory'); }
    return !!loc;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await initPhotoDB();
    if (typeof CATEGORIES === 'undefined') {
        console.error('CRITICAL: CATEGORIES not loaded!');
        alert('ERROR: Location data failed to load. Please refresh.');
        return;
    }

    // Wire persistent file inputs (survive iOS camera reload)
    document.getElementById('photoCameraInput').addEventListener('change', handlePhotoFile);
    document.getElementById('photoFileInput').addEventListener('change', handlePhotoFile);

    setTimeout(() => {
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.classList.add('hidden');
        const searchResults = document.getElementById('globalSearchResults');
        if (searchResults) { searchResults.classList.add('hidden'); searchResults.innerHTML = ''; }
    }, 100);

    loadEntries();
    loadAddressOverrides();
    loadLocationLog();
    renderCategories();
    renderEntries();
    updateCurrentDate();
    setupEventListeners();
    checkActiveEntry();
    startBackupSchedule();

    // Restore after iOS camera reload
    const wasInPhotoMode = restorePhotoState();
    if (wasInPhotoMode && selectedLocation) {
        currentLocationPhotos = await loadLocationPhotos(selectedLocation.name);
        document.getElementById('globalSearchSection').classList.add('hidden');
        document.getElementById('categorySelection').classList.add('hidden');
        document.getElementById('locationDetails').classList.remove('hidden');
        if (photoViewMode) { showPhotoGallery(); } else { renderLocationDetailsView(); }
    }
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

function getLocationPhotos(locationName) {
    return currentLocationPhotos; // populated per-location on demand
}

async function loadLocationPhotos(locationName) {
    if (!photoDB) return [];
    return new Promise(resolve => {
        const tx = photoDB.transaction('photos', 'readonly');
        const store = tx.objectStore('photos');
        let req;
        if (store.indexNames.contains('by_location')) {
            req = store.index('by_location').getAll(IDBKeyRange.only(locationName));
            req.onsuccess = () => resolve((req.result || []).sort((a,b) => b.timestamp - a.timestamp));
        } else {
            req = store.getAll();
            req.onsuccess = () => resolve((req.result || []).filter(p => p.location === locationName).sort((a,b) => b.timestamp - a.timestamp));
        }
        req.onerror = () => resolve([]);
    });
}

async function savePhotoToDB(photoData) {
    if (!photoDB) return;
    photoCountsCache = null;
    return new Promise(resolve => {
        const tx = photoDB.transaction('photos', 'readwrite');
        tx.objectStore('photos').put(photoData);
        tx.oncomplete = resolve;
    });
}

async function deletePhotoFromDB(photoId) {
    if (!photoDB) return;
    photoCountsCache = null;
    return new Promise(resolve => {
        const tx = photoDB.transaction('photos', 'readwrite');
        tx.objectStore('photos').delete(photoId);
        tx.oncomplete = resolve;
    });
}

async function getAllPhotosForExport() {
    if (!photoDB) return [];
    return new Promise(resolve => {
        const tx = photoDB.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });
}

async function getPhotoCountForLocation(locationName) {
    const counts = await getAllPhotoCountsMap();
    return counts[locationName] || 0;
}

async function getAllPhotoCountsMap() {
    if (photoCountsCache) return photoCountsCache;
    if (!photoDB) return {};
    return new Promise(resolve => {
        const tx = photoDB.transaction('photos', 'readonly');
        const store = tx.objectStore('photos');
        const map = {};
        if (store.indexNames.contains('by_location')) {
            const req = store.index('by_location').openKeyCursor();
            req.onsuccess = e => {
                const cursor = e.target.result;
                if (cursor) {
                    map[cursor.key] = (map[cursor.key] || 0) + 1;
                    cursor.continue();
                } else {
                    photoCountsCache = map;
                    resolve(map);
                }
            };
            req.onerror = () => resolve({});
        } else {
            const req = store.getAll();
            req.onsuccess = () => {
                (req.result || []).forEach(p => { map[p.location] = (map[p.location] || 0) + 1; });
                photoCountsCache = map;
                resolve(map);
            };
            req.onerror = () => resolve({});
        }
    });
}

function loadAddressOverrides() {
    const stored = localStorage.getItem('addressOverrides');
    addressOverrides = stored ? JSON.parse(stored) : {};
}

function saveAddressOverrides() {
    localStorage.setItem('addressOverrides', JSON.stringify(addressOverrides));
}

function getEffectiveAddress(locationName, defaultAddress) {
    return addressOverrides[locationName] !== undefined ? addressOverrides[locationName] : (defaultAddress || '');
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
        <div class="location-item"
            data-name="${escapeAttr(loc.name)}"
            data-sz="${escapeAttr(loc.chargeCodeSZ)}"
            data-mos="${escapeAttr(loc.chargeCodeMOS)}"
            data-addr="${escapeAttr(loc.address)}"
            data-cat="${escapeAttr(loc.category)}">
            <div class="loc-name">${escapeHtml(loc.name)}</div>
            <div class="loc-code">${escapeHtml(loc.chargeCodeSZ) || 'No code'}</div>
            <div class="loc-category">${escapeHtml(loc.category)}</div>
        </div>
    `).join('');
    results.querySelectorAll('.location-item').forEach(el => {
        el.addEventListener('click', () => showLocationDetails(
            el.dataset.name, el.dataset.sz, el.dataset.mos, el.dataset.addr, el.dataset.cat
        ));
    });
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
    const cats = Object.keys(CATEGORIES).sort((a, b) => {
        if (a === 'Miscellaneous') return 1;
        if (b === 'Miscellaneous') return -1;
        return 0;
    });
    list.innerHTML = cats.map(cat => `
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
async function renderLocationList() {
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
    
    const photoCounts = await getAllPhotoCountsMap();
    const items = locations.map(loc => {
        const photoCount = photoCounts[loc.name] || 0;
        const photoIndicator = photoCount > 0 ? ` 📸 ${photoCount}` : '';
        return `<div class="location-item"
            data-name="${escapeAttr(loc.name)}"
            data-sz="${escapeAttr(loc.chargeCodeSZ)}"
            data-mos="${escapeAttr(loc.chargeCodeMOS)}"
            data-addr="${escapeAttr(loc.address || '')}"
            data-cat="${escapeAttr(selectedCategory)}">
            <div class="loc-name">${escapeHtml(loc.name)}${photoIndicator}</div>
            <div class="loc-code">${escapeHtml(loc.chargeCodeSZ) || 'No code'}</div>
            ${loc.address && loc.address.trim() !== '' ? `<div class="loc-address">${escapeHtml(loc.address)}</div>` : ''}
        </div>`;
    });
    list.innerHTML = items.join('');
    list.querySelectorAll('.location-item').forEach(el => {
        el.addEventListener('click', () => showLocationDetails(
            el.dataset.name, el.dataset.sz, el.dataset.mos, el.dataset.addr, el.dataset.cat
        ));
    });
}

// Location Details - WITH PHOTO BUTTON
async function showLocationDetails(name, chargeCodeSZ, chargeCodeMOS, address, category) {
    selectedLocation = { name, chargeCodeSZ, chargeCodeMOS, address, category };
    currentLocationPhotos = [];
    photoViewMode = false;

    if (name === 'Training') { confirmStartTimer(); return; }

    // Show screen immediately, no waiting
    document.getElementById('locationSelection').classList.add('hidden');
    document.getElementById('globalSearchSection').classList.add('hidden');
    document.getElementById('categorySelection').classList.add('hidden');
    document.getElementById('locationDetails').classList.remove('hidden');
    renderLocationDetailsView();

    // Load photos in background, update only if count changed
    loadLocationPhotos(name).then(photos => {
        const hadPhotos = currentLocationPhotos.length;
        currentLocationPhotos = photos;
        if (!photoViewMode && photos.length !== hadPhotos) renderLocationDetailsView();
    });
}

function renderLocationDetailsView() {
    if (!selectedLocation) return;
    
    const photoCount = currentLocationPhotos.length;
    const lastVisit = getLastVisitDate(selectedLocation.name);
    const effectiveAddress = getEffectiveAddress(selectedLocation.name, selectedLocation.address);
    
    // Rebuild full card so it works after showPhotoGallery replaces innerHTML
    const detailsCard = document.querySelector('#locationDetails .details-card');
    if (!detailsCard) return;
    
    let addrHtml;
    if (effectiveAddress && effectiveAddress.trim() !== '') {
        addrHtml = `<div id="detailsAddress" class="details-address" style="display:block"><div class="address-container"><a href="https://maps.apple.com/?q=${encodeURIComponent(effectiveAddress)}" target="_blank" class="address-link">&#128205; ${effectiveAddress}</a><button class="btn-edit-address" onclick="editAddress()">Edit</button></div></div>`;
    } else {
        addrHtml = `<div id="detailsAddress" class="details-address" style="display:block"><button class="btn-add-address" onclick="editAddress()">+ Add Address</button></div>`;
    }
    
    let photoBtns = '';
    if (lastVisit && photoCount > 0) {
        photoBtns += `<div class="photo-info-banner">Last visit: ${lastVisit} &bull; ${photoCount} photo${photoCount !== 1 ? 's' : ''}</div>`;
    }
    if (photoCount > 0) {
        photoBtns += `<button class="btn btn-primary" onclick="togglePhotoView()">📸 View Photos (${photoCount})</button>`;
    } else {
        photoBtns += `<button class="btn btn-primary" onclick="togglePhotoView()">📷 Add Photos</button>`;
    }
    
    detailsCard.innerHTML = `
        <div class="details-location" id="detailsLocation">${selectedLocation.name}</div>
        <div class="details-code" id="detailsChargeCode">${selectedLocation.chargeCodeSZ || 'No charge code'}</div>
        ${addrHtml}
        <div class="details-buttons">
            ${photoBtns}
            <button class="btn btn-email" onclick="emailDispatchStart()">📧 Email Dispatch to Start</button>
            <button class="btn btn-primary" onclick="confirmStartTimer()">▶ Start Timer</button>
        </div>
    `;
}

function editAddress() {
    if (!selectedLocation) return;
    const current = getEffectiveAddress(selectedLocation.name, selectedLocation.address);
    const newAddr = prompt('Enter address (leave blank to remove):', current);
    if (newAddr === null) return;
    addressOverrides[selectedLocation.name] = newAddr.trim();
    saveAddressOverrides();
    renderLocationDetailsView();
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
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
}

// Photos stored in IndexedDB - see loadLocationPhotos, savePhotoToDB, deletePhotoFromDB

function backFromDetails() {
    selectedLocation = null;
    currentLocationPhotos = [];
    photoViewMode = false;
    document.getElementById('locationDetails').classList.add('hidden');
    
    if (selectedCategory) {
        document.getElementById('locationSelection').classList.remove('hidden');
    } else {
        document.getElementById('globalSearchSection').classList.remove('hidden');
        document.getElementById('categorySelection').classList.remove('hidden');
    }
}

// Photo Gallery
function togglePhotoView() {
    photoViewMode = !photoViewMode;
    
    if (photoViewMode) {
        showPhotoGallery();
    } else {
        renderLocationDetailsView();
    }
}

function showPhotoGallery() {
    const detailsCard = document.querySelector('#locationDetails .details-card');
    if (!detailsCard) return;
    
    detailsCard.innerHTML = `
        <div class="photo-gallery-header">
            <h2>📸 ${selectedLocation.name}</h2>
            <p>${currentLocationPhotos.length} photo${currentLocationPhotos.length !== 1 ? 's' : ''}</p>
        </div>
        <div class="photo-capture-section">
            <button class="btn btn-primary btn-capture" onclick="persistPhotoState();document.getElementById('photoCameraInput').click()">📷 Take Photo</button>
            <button class="btn btn-secondary" onclick="persistPhotoState();document.getElementById('photoFileInput').click()">📁 Upload Photo</button>
        </div>
        <div class="photo-gallery" id="photoGalleryGrid">
            ${renderPhotoGrid()}
        </div>
        <div class="details-buttons">
            <button class="btn btn-secondary" onclick="togglePhotoView()">⏱️ Back to Details</button>
        </div>
    `;
}

function renderPhotoGrid() {
    if (currentLocationPhotos.length === 0) {
        return '<div class="no-photos">No photos yet. Take your first photo!</div>';
    }
    return currentLocationPhotos.map((photo, index) => `
        <div class="photo-card" onclick="viewFullPhoto(${index})">
            <img src="${photo.url}" alt="Photo ${index + 1}" loading="lazy">
            <div class="photo-overlay">
                <div class="photo-date">${formatPhotoDate(photo.timestamp)}</div>
                📱
            </div>
        </div>
    `).join('');
}
function formatPhotoDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

// capturePhoto removed - using native file input with capture="environment" attribute

async function handlePhotoFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
    }
    await savePhotoLocally(file);
    event.target.value = '';
}

// Photo Save - Local IndexedDB (no server needed)
async function savePhotoLocally(photoBlob) {
    showLoadingIndicator('Saving photo...');
    try {
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(photoBlob);
        });
        
        if (!selectedLocation) throw new Error('Location lost - please go back and try again');
        const photoData = {
            id: Date.now().toString(),
            url: dataUrl,
            timestamp: Date.now(),
            location: selectedLocation.name,
            storage: 'local'
        };
        
        await savePhotoToDB(photoData);
        currentLocationPhotos = await loadLocationPhotos(selectedLocation.name);
        
        hideLoadingIndicator();
        if (photoViewMode) showPhotoGallery();
    } catch (error) {
        console.error('Photo save failed:', error);
        hideLoadingIndicator();
        alert('Photo save failed: ' + error.message);
    }
}



function showLoadingIndicator(message) {
    const existing = document.getElementById('loadingIndicator');
    if (existing) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'loadingIndicator';
    indicator.className = 'loading-indicator';
    indicator.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <div>${message}</div>
        </div>
    `;
    document.body.appendChild(indicator);
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        document.body.removeChild(indicator);
    }
}

// Photo Viewer
function viewFullPhoto(index) {
    const photo = currentLocationPhotos[index];
    if (!photo) return;

    const viewer = document.createElement('div');
    viewer.className = 'photo-viewer-overlay';
    viewer.innerHTML = `
        <div class="photo-viewer">
            <div class="photo-viewer-header">
                <button onclick="closePhotoViewer()">✕ Close</button>
                <div class="photo-info">${index + 1} / ${currentLocationPhotos.length}</div>
            </div>
            <div class="photo-zoom-container" id="photoZoomContainer">
                <img id="photoViewerImg" src="${photo.url}" alt="Photo" style="touch-action:none;transform-origin:center center;">
            </div>
            <div class="photo-viewer-footer">
                <div>${selectedLocation.name}</div>
                <div>${new Date(photo.timestamp).toLocaleString()}</div>
            </div>
            <div class="photo-viewer-nav">
                ${index > 0 ? `<button onclick="viewFullPhoto(${index - 1})">← Previous</button>` : '<div></div>'}
                <button class="btn-delete" onclick="deletePhoto(${index})">🗑️ Delete</button>
                ${index < currentLocationPhotos.length - 1 ? `<button onclick="viewFullPhoto(${index + 1})">Next →</button>` : '<div></div>'}
            </div>
        </div>
    `;
    document.body.appendChild(viewer);
    initPinchZoom(document.getElementById('photoViewerImg'));
}

function initPinchZoom(img) {
    let scale = 1, lastScale = 1;
    let originX = 0, originY = 0;
    let lastX = 0, lastY = 0;
    let isPinching = false;

    img.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            isPinching = true;
            lastScale = scale;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            originX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            originY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            img._pinchDist = Math.hypot(dx, dy);
        } else if (e.touches.length === 1 && scale > 1) {
            lastX = e.touches[0].clientX - (img._translateX || 0);
            lastY = e.touches[0].clientY - (img._translateY || 0);
        }
    }, { passive: true });

    img.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && isPinching) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            scale = Math.min(Math.max(lastScale * (dist / img._pinchDist), 1), 5);
            applyTransform(img, scale);
        } else if (e.touches.length === 1 && scale > 1) {
            e.preventDefault();
            img._translateX = e.touches[0].clientX - lastX;
            img._translateY = e.touches[0].clientY - lastY;
            applyTransform(img);
        }
    }, { passive: false });

    img.addEventListener('touchend', e => {
        if (e.touches.length < 2) isPinching = false;
        if (scale <= 1) { scale = 1; img._translateX = 0; img._translateY = 0; applyTransform(img, 1); }
    }, { passive: true });

    // Double-tap to reset
    let lastTap = 0;
    img.addEventListener('touchend', e => {
        const now = Date.now();
        if (now - lastTap < 300) {
            scale = 1; img._translateX = 0; img._translateY = 0; applyTransform(img, 1);
        }
        lastTap = now;
    }, { passive: true });
}

function applyTransform(img, s) {
    if (s !== undefined) img._currentScale = s;
    const sc = img._currentScale || 1;
    const tx = img._translateX || 0;
    const ty = img._translateY || 0;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
}

function closePhotoViewer() {
    const viewer = document.querySelector('.photo-viewer-overlay');
    if (viewer) {
        document.body.removeChild(viewer);
    }
}

async function deletePhoto(index) {
    if (!confirm('Delete this photo?')) return;
    
    const photo = currentLocationPhotos[index];
    if (photo) await deletePhotoFromDB(photo.id);
    
    currentLocationPhotos = await loadLocationPhotos(selectedLocation.name);
    closePhotoViewer();
    if (photoViewMode) showPhotoGallery();
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
    hideCodeModal();
    sendStartEmail(code);
}

function sendStartEmail(code) {
    const subject = code;
    const body = `Please open a ticket to start work at ${selectedLocation.name}`;
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
        addressLink.textContent = `ðŸ“ ${activeEntry.address}`;
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
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    activeEntry.endTime = new Date().toISOString();
    activeEntry.workOrder = document.getElementById('workOrderField').value.trim();
    activeEntry.notes = document.getElementById('notesField').value;
    
    entries.push(activeEntry);
    saveEntries();
    const locationName = activeEntry.location;
    activeEntry = null;
    saveActiveEntry();
    hideActiveTimer();
    renderEntries();

    if (locationName !== 'Training') {
        showCloseTicketBanner();
    }
}

function finishEntry() {
    entries.push(activeEntry);
    saveEntries();
    
    activeEntry = null;
    saveActiveEntry();
    
    hideActiveTimer();
    renderEntries();
}

function showCloseTicketBanner() {
    const existing = document.getElementById('closeTicketBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'closeTicketBanner';
    banner.className = 'close-ticket-banner';
    banner.innerHTML = `
        <div class="close-ticket-content">
            <span>🎫 Remember to close your ticket in Motorola</span>
            <button onclick="document.getElementById('closeTicketBanner').remove()">✕</button>
        </div>
    `;
    document.getElementById('todaySection').insertAdjacentElement('beforebegin', banner);
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
                        <button class="btn-edit" onclick="editEntry('${entry.id}')">Edit Time</button>
                        <button class="btn-edit" onclick="editDetails('${entry.id}')">Details</button>
                        <button class="btn-delete" onclick="deleteEntry('${entry.id}')">🗑️</button>
                    </div>
                </div>
                ${entry.chargeCodeSZ ? `<div class="entry-code">${entry.chargeCodeSZ}</div>` : ''}
                ${entry.workOrder ? `<div class="entry-workorder">WO #${entry.workOrder}</div>` : ''}
                <div class="entry-time">${formatTime(start)} - ${formatTime(end)}</div>
                <div class="entry-duration">${formatDuration(duration)}</div>
                ${entry.notes ? `<div class="entry-notes">ðŸ“ ${entry.notes}</div>` : ''}
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
        entries = entries.filter(e => String(e.id) !== String(id));
        saveEntries();
        renderEntries();
    }
}

function editEntry(id) {
    const entry = entries.find(e => String(e.id) === String(id));
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
    const entry = entries.find(e => String(e.id) === String(id));
    if (!entry) return;
    
    const currentWO = entry.workOrder || '';
    const currentNotes = entry.notes || '';
    
    const newWO = prompt(
        `Edit Work Order # for ${entry.location}:\n\n(Leave blank if none)`,
        currentWO
    );
    
    if (newWO === null) return;
    
    const newNotes = prompt(
        `Edit notes for ${entry.location}:\n\n(Leave blank to remove notes)`,
        currentNotes
    );
    
    if (newNotes === null) return;
    
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
    document.getElementById('pastSearchBox').value = '';
    document.getElementById('pastSearchResults').innerHTML = '';
    document.getElementById('pastSearchResults').classList.add('hidden');
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
            <button onclick="previousMonth()">← Prev</button>
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
    lastViewedDate = { year, month, day };
    const targetDate = new Date(year, month, day);
    const dateString = targetDate.toDateString();
    
    const dateEntries = entries.filter(e => new Date(e.startTime).toDateString() === dateString);
    if (dateEntries.length === 0) return;
    
    document.getElementById('selectedDateTitle').textContent = targetDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    
    renderPastEntriesForDate(dateEntries);
    document.getElementById('pastEntriesDetail').classList.remove('hidden');
}

function renderPastEntriesForDate(dateEntries) {
    const entriesDiv = document.getElementById('selectedDateEntries');
    entriesDiv.innerHTML = dateEntries.map(entry => {
        const start = new Date(entry.startTime);
        const end = new Date(entry.endTime);
        const duration = end - start;
        return `
            <div class="entry-card">
                <div class="entry-header">
                    <div class="entry-location">${entry.location}</div>
                    <div class="entry-actions">
                        <button class="btn-edit" onclick="editPastEntry('${entry.id}')">Edit Time</button>
                        <button class="btn-edit" onclick="editPastDetails('${entry.id}')">Details</button>
                        <button class="btn-delete" onclick="deletePastEntry('${entry.id}')">🗑️</button>
                    </div>
                </div>
                ${entry.chargeCodeSZ ? `<div class="entry-code">${entry.chargeCodeSZ}</div>` : ''}
                ${entry.workOrder ? `<div class="entry-workorder">WO #${entry.workOrder}</div>` : ''}
                <div class="entry-time">${formatTime(start)} - ${formatTime(end)}</div>
                <div class="entry-duration">${formatDuration(duration)}</div>
                ${entry.notes ? `<div class="entry-notes">&#128221; ${entry.notes}</div>` : ''}
            </div>
        `;
    }).join('');
}

function refreshPastEntries() {
    if (lastViewedDate) {
        const { year, month, day } = lastViewedDate;
        const dateString = new Date(year, month, day).toDateString();
        const dateEntries = entries.filter(e => new Date(e.startTime).toDateString() === dateString);
        if (dateEntries.length === 0) {
            document.getElementById('pastEntriesDetail').classList.add('hidden');
        } else {
            renderPastEntriesForDate(dateEntries);
        }
        renderCalendar();
    }
}

function editPastEntry(id) { editEntry(id); refreshPastEntries(); }
function editPastDetails(id) { editDetails(id); refreshPastEntries(); }

function deletePastEntry(id) {
    if (confirm('Delete this entry?')) {
        entries = entries.filter(e => String(e.id) !== String(id));
        saveEntries();
        refreshPastEntries();
    }
}

function searchPastEntries() {
    const term = document.getElementById('pastSearchBox').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('pastSearchResults');
    
    if (!term) {
        resultsDiv.innerHTML = '';
        resultsDiv.classList.add('hidden');
        return;
    }
    
    const matches = entries.filter(e =>
        e.location.toLowerCase().includes(term) ||
        (e.chargeCodeSZ && e.chargeCodeSZ.toLowerCase().includes(term)) ||
        (e.workOrder && e.workOrder.toLowerCase().includes(term)) ||
        (e.notes && e.notes.toLowerCase().includes(term))
    );
    
    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="no-entries">No entries found</div>';
        resultsDiv.classList.remove('hidden');
        return;
    }
    
    // Group by date
    const groups = {};
    matches.forEach(e => {
        const d = new Date(e.startTime).toDateString();
        if (!groups[d]) groups[d] = [];
        groups[d].push(e);
    });
    
    // Sort dates newest first
    const sortedDates = Object.keys(groups).sort((a,b) => new Date(b) - new Date(a));
    
    resultsDiv.innerHTML = sortedDates.map(dateStr => {
        const dateEntries = groups[dateStr];
        const dateLabel = new Date(dateStr).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
        return `
            <div class="search-date-group">
                <div class="search-date-header">${dateLabel}</div>
                ${dateEntries.map(entry => {
                    const start = new Date(entry.startTime);
                    const end = new Date(entry.endTime);
                    const duration = end - start;
                    return `
                        <div class="entry-card">
                            <div class="entry-header">
                                <div class="entry-location">${entry.location}</div>
                                <div class="entry-actions">
                                    <button class="btn-edit" onclick="editSearchEntry('${entry.id}')">Edit Time</button>
                                    <button class="btn-edit" onclick="editSearchDetails('${entry.id}')">Details</button>
                                    <button class="btn-delete" onclick="deleteSearchEntry('${entry.id}')">🗑️</button>
                                </div>
                            </div>
                            ${entry.chargeCodeSZ ? `<div class="entry-code">${entry.chargeCodeSZ}</div>` : ''}
                            ${entry.workOrder ? `<div class="entry-workorder">WO #${entry.workOrder}</div>` : ''}
                            <div class="entry-time">${formatTime(start)} - ${formatTime(end)}</div>
                            <div class="entry-duration">${formatDuration(duration)}</div>
                            ${entry.notes ? `<div class="entry-notes">&#128221; ${entry.notes}</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }).join('');
    
    resultsDiv.classList.remove('hidden');
}

function editSearchEntry(id) { editEntry(id); searchPastEntries(); }
function editSearchDetails(id) { editDetails(id); searchPastEntries(); }
function deleteSearchEntry(id) {
    if (confirm('Delete this entry?')) {
        entries = entries.filter(e => String(e.id) !== String(id));
        saveEntries();
        searchPastEntries();
    }
}


// Event Listeners
function setupEventListeners() {
    document.getElementById('globalSearchBox').addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => handleGlobalSearch(e.target.value), 150);
    });
    
    document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
    document.getElementById('backBtn').addEventListener('click', backToCategories);
    document.getElementById('backFromDetailsBtn').addEventListener('click', backFromDetails);
    document.getElementById('backFromCalendarBtn').addEventListener('click', hideCalendar);
    
    document.getElementById('stopBtn').addEventListener('click', stopTimer);
    
    document.getElementById('viewPastBtn').addEventListener('click', showCalendar);
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', importData);
    
    document.getElementById('useSZCode').addEventListener('click', () => handleCodeSelection('SZ'));
    document.getElementById('useMOSCode').addEventListener('click', () => handleCodeSelection('MOS'));
    document.getElementById('cancelCodeModal').addEventListener('click', hideCodeModal);

    document.getElementById('logLocationBtn').addEventListener('click', logCurrentLocation);
    document.getElementById('viewLogBtn').addEventListener('click', showLocationLog);
    document.getElementById('backFromLogBtn').addEventListener('click', hideLocationLog);
    document.getElementById('smsLogBtn').addEventListener('click', smsLocationLog);
    document.getElementById('clearLogBtn').addEventListener('click', clearLocationLog);

    document.getElementById('viewBackupsBtn').addEventListener('click', showBackupView);
    document.getElementById('backFromBackupsBtn').addEventListener('click', hideBackupView);
    
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


function updateCurrentDate() {
    const dateDiv = document.getElementById('currentDate');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDiv.textContent = new Date().toLocaleDateString('en-US', options);
}

// Export/Import - WITH PHOTOS
async function exportData() {
    const allPhotos = await getAllPhotosForExport();
    const data = {
        entries: entries,
        photos: allPhotos,
        addressOverrides: addressOverrides,
        exportDate: new Date().toISOString(),
        version: 'v5.0.0'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const filename = `timevault-backup-${date}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    alert(`✅ Backup saved: ${filename}\n\nIncludes ${entries.length} entries and ${allPhotos.length} photos.`);
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain,*/*';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const raw = event.target.result.trim();
                let data;
                try {
                    data = JSON.parse(raw);
                } catch (parseErr) {
                    alert('✘ This file is not valid JSON.\n\nMake sure you selected a TimeVault backup file (.json).');
                    return;
                }

                // Support both old and new backup formats
                let importEntries = null;
                let importPhotos = [];
                let importOverrides = null;
                let importLocationLog = null;
                let exportInfo = '';

                if (Array.isArray(data)) {
                    // Bare array of entries (very old format)
                    importEntries = data;
                } else if (data.entries && Array.isArray(data.entries)) {
                    // Standard format
                    importEntries = data.entries;
                    importPhotos = data.photos || [];
                    importOverrides = data.addressOverrides || null;
                    importLocationLog = data.locationLog || null;
                    if (data.exportDate) exportInfo = `\nBackup from: ${new Date(data.exportDate).toLocaleString()}`;
                    if (data.version) exportInfo += `\nVersion: ${data.version}`;
                } else {
                    alert('✘ Unrecognized backup format.\n\nThis file does not contain TimeVault data.');
                    return;
                }

                const photoCount = importPhotos.length;
                const confirmMsg = `Import ${importEntries.length} entries and ${photoCount} photos?\n\nThis will REPLACE your current data.${exportInfo}`;

                if (confirm(confirmMsg)) {
                    entries = importEntries;
                    saveEntries();

                    if (importOverrides) {
                        addressOverrides = importOverrides;
                        saveAddressOverrides();
                    }

                    if (importLocationLog) {
                        locationLog = importLocationLog;
                        saveLocationLog();
                    }

                    if (importPhotos.length > 0 && photoDB) {
                        const tx = photoDB.transaction('photos', 'readwrite');
                        const store = tx.objectStore('photos');
                        store.clear();
                        importPhotos.forEach(p => store.put(p));
                        await new Promise(r => tx.oncomplete = r);
                        photoCountsCache = null;
                    }

                    renderEntries();
                    alert(`✅ Imported ${entries.length} entries and ${photoCount} photos successfully!`);
                }
            } catch (err) {
                alert('✘ Error reading backup file: ' + err.message);
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
    div.textContent = text || '';
    return div.innerHTML;
}

function escapeAttr(text) {
    return (text || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


// ============================================
// AUTO-BACKUP (end of day, local only)
// ============================================

const MAX_BACKUPS = 7;
let backupCheckInterval = null;

function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

async function autoBackup() {
    if (!photoDB || !photoDB.objectStoreNames.contains('backups')) return;

    const today = getTodayDateString();
    const lastBackup = localStorage.getItem('lastAutoBackup');
    if (lastBackup === today) return; // already backed up today

    try {
        const allPhotos = await getAllPhotosForExport();
        const backup = {
            date: today,
            timestamp: new Date().toISOString(),
            entries: entries,
            photos: allPhotos,
            addressOverrides: addressOverrides,
            locationLog: locationLog || [],
            version: document.querySelector('.version')?.textContent || 'unknown'
        };

        await new Promise((resolve, reject) => {
            const tx = photoDB.transaction('backups', 'readwrite');
            tx.objectStore('backups').put(backup);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        localStorage.setItem('lastAutoBackup', today);
        console.log('Auto-backup saved for', today);
        showBackupStatus('✓ Auto-backup saved');

        await pruneOldBackups();
    } catch (err) {
        console.error('Auto-backup failed:', err);
    }
}

async function pruneOldBackups() {
    if (!photoDB || !photoDB.objectStoreNames.contains('backups')) return;
    return new Promise(resolve => {
        const tx = photoDB.transaction('backups', 'readwrite');
        const store = tx.objectStore('backups');
        const req = store.getAllKeys();
        req.onsuccess = () => {
            const keys = (req.result || []).sort();
            if (keys.length > MAX_BACKUPS) {
                const toDelete = keys.slice(0, keys.length - MAX_BACKUPS);
                toDelete.forEach(k => store.delete(k));
            }
        };
        tx.oncomplete = resolve;
        tx.onerror = resolve;
    });
}

async function listBackups() {
    if (!photoDB || !photoDB.objectStoreNames.contains('backups')) return [];
    return new Promise(resolve => {
        const tx = photoDB.transaction('backups', 'readonly');
        const req = tx.objectStore('backups').getAll();
        req.onsuccess = () => {
            const backups = (req.result || []).map(b => ({
                date: b.date,
                timestamp: b.timestamp,
                entryCount: (b.entries || []).length,
                photoCount: (b.photos || []).length,
                version: b.version
            }));
            backups.sort((a, b) => b.date.localeCompare(a.date));
            resolve(backups);
        };
        req.onerror = () => resolve([]);
    });
}

async function loadBackup(date) {
    if (!photoDB || !photoDB.objectStoreNames.contains('backups')) return null;
    return new Promise(resolve => {
        const tx = photoDB.transaction('backups', 'readonly');
        const req = tx.objectStore('backups').get(date);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
    });
}

async function restoreFromBackup(date) {
    const backup = await loadBackup(date);
    if (!backup) { alert('Backup not found.'); return; }

    const msg = `Restore backup from ${backup.date}?\n\n` +
        `${backup.entries.length} entries, ${(backup.photos || []).length} photos\n` +
        `Saved: ${new Date(backup.timestamp).toLocaleString()}\n\n` +
        `This will REPLACE your current data.`;
    if (!confirm(msg)) return;

    entries = backup.entries || [];
    saveEntries();

    if (backup.addressOverrides) {
        addressOverrides = backup.addressOverrides;
        saveAddressOverrides();
    }

    if (backup.locationLog) {
        locationLog = backup.locationLog;
        saveLocationLog();
    }

    if (backup.photos && backup.photos.length > 0 && photoDB) {
        const tx = photoDB.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        store.clear();
        backup.photos.forEach(p => store.put(p));
        await new Promise(r => tx.oncomplete = r);
        photoCountsCache = null;
    }

    renderEntries();
    hideBackupView();
    alert(`✅ Restored backup from ${backup.date}.\n${entries.length} entries, ${(backup.photos || []).length} photos.`);
}

async function deleteBackup(date) {
    if (!confirm(`Delete backup from ${date}?`)) return;
    if (!photoDB || !photoDB.objectStoreNames.contains('backups')) return;
    await new Promise(resolve => {
        const tx = photoDB.transaction('backups', 'readwrite');
        tx.objectStore('backups').delete(date);
        tx.oncomplete = resolve;
    });
    showBackupView();
}

function showBackupStatus(msg) {
    const el = document.getElementById('backupStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
}

async function showBackupView() {
    document.getElementById('todaySection').classList.add('hidden');
    document.getElementById('globalSearchSection').classList.add('hidden');
    document.getElementById('categorySelection').classList.add('hidden');
    document.getElementById('backupView').classList.remove('hidden');

    const list = document.getElementById('backupList');
    list.innerHTML = '<div class="no-entries">Loading backups...</div>';

    const backups = await listBackups();
    if (backups.length === 0) {
        list.innerHTML = '<div class="no-entries">No auto-backups yet.<br>Backups are created automatically at the end of each day.</div>';
        return;
    }

    list.innerHTML = backups.map(b => {
        const d = new Date(b.timestamp);
        const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const timeLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `
            <div class="backup-entry">
                <div class="backup-entry-info">
                    <div class="backup-entry-date">${dateLabel}</div>
                    <div class="backup-entry-details">${b.entryCount} entries · ${b.photoCount} photos · ${timeLabel}</div>
                </div>
                <div class="backup-entry-actions">
                    <button class="btn-edit" onclick="restoreFromBackup('${b.date}')">Restore</button>
                    <button class="btn-delete-log" onclick="deleteBackup('${b.date}')">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function hideBackupView() {
    document.getElementById('backupView').classList.add('hidden');
    document.getElementById('todaySection').classList.remove('hidden');
    document.getElementById('globalSearchSection').classList.remove('hidden');
    document.getElementById('categorySelection').classList.remove('hidden');
}

function startBackupSchedule() {
    // Delay backup 30 seconds so it doesn't block page load
    setTimeout(() => {
        const lastBackup = localStorage.getItem('lastAutoBackup');
        if (lastBackup !== getTodayDateString()) {
            autoBackup();
        }
    }, 30000);

    // Check every 30 minutes (catches day rollover if app stays open)
    backupCheckInterval = setInterval(() => {
        const lastBackup = localStorage.getItem('lastAutoBackup');
        if (lastBackup !== getTodayDateString()) {
            autoBackup();
        }
    }, 30 * 60 * 1000);
}

// ============================================
// GPS LOCATION LOG
// ============================================

let locationLog = [];

function loadLocationLog() {
    const stored = localStorage.getItem('locationLog');
    locationLog = stored ? JSON.parse(stored) : [];
    const saved = localStorage.getItem('smsPhone');
    if (saved) document.getElementById('smsPhoneInput').value = saved;
}

function saveLocationLog() {
    localStorage.setItem('locationLog', JSON.stringify(locationLog));
}

function showGpsStatus(msg, type) {
    const el = document.getElementById('gpsStatus');
    el.textContent = msg;
    el.className = `gps-status ${type}`;
    el.classList.remove('hidden');
    if (type === 'success') setTimeout(() => el.classList.add('hidden'), 3000);
}

async function logCurrentLocation() {
    const btn = document.getElementById('logLocationBtn');
    btn.disabled = true;
    showGpsStatus('Getting GPS...', 'resolving');

    if (!navigator.geolocation) {
        showGpsStatus('GPS not supported on this device.', 'error');
        btn.disabled = false;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            showGpsStatus('Resolving address...', 'resolving');

            let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                const data = await res.json();
                if (data && data.display_name) {
                    // Trim to street + city level
                    const parts = data.display_name.split(',').map(s => s.trim());
                    address = parts.slice(0, 4).join(', ');
                }
            } catch (e) {
                // fall back to coords
            }

            const entry = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                address,
                lat: latitude,
                lon: longitude,
                accuracy: Math.round(accuracy)
            };

            locationLog.unshift(entry);
            saveLocationLog();
            showGpsStatus(`✓ Logged: ${address}`, 'success');
            btn.disabled = false;
        },
        (err) => {
            const msgs = {
                1: 'Location permission denied. Check browser settings.',
                2: 'GPS signal unavailable.',
                3: 'GPS timed out. Try again.'
            };
            showGpsStatus(msgs[err.code] || 'GPS error.', 'error');
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function showLocationLog() {
    document.getElementById('globalSearchSection').classList.add('hidden');
    document.getElementById('categorySelection').classList.add('hidden');
    document.getElementById('todaySection').classList.add('hidden');
    document.getElementById('locationLogView').classList.remove('hidden');
    renderLocationLog();
}

function hideLocationLog() {
    document.getElementById('locationLogView').classList.add('hidden');
    document.getElementById('globalSearchSection').classList.remove('hidden');
    document.getElementById('categorySelection').classList.remove('hidden');
    document.getElementById('todaySection').classList.remove('hidden');
}

function renderLocationLog() {
    const list = document.getElementById('locationLogList');
    if (locationLog.length === 0) {
        list.innerHTML = '<div class="log-empty">No locations logged yet.<br>Tap "Log My Location" to start.</div>';
        return;
    }

    list.innerHTML = locationLog.map(entry => {
        const dt = new Date(entry.timestamp);
        const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `
            <div class="log-entry">
                <div class="log-entry-info">
                    <div class="log-entry-time">${dateStr} ${timeStr} · ±${entry.accuracy}m</div>
                    <div class="log-entry-address">${entry.address}</div>
                    <div class="log-entry-coords">${entry.lat.toFixed(5)}, ${entry.lon.toFixed(5)}</div>
                </div>
                <button class="btn-delete-log" onclick="deleteLogEntry(${entry.id})">✕</button>
            </div>
        `;
    }).join('');
}

function deleteLogEntry(id) {
    locationLog = locationLog.filter(e => e.id !== id);
    saveLocationLog();
    renderLocationLog();
}

function clearLocationLog() {
    if (!confirm('Clear all location log entries?')) return;
    locationLog = [];
    saveLocationLog();
    renderLocationLog();
}

function smsLocationLog() {
    const phone = document.getElementById('smsPhoneInput').value.trim();
    if (!phone) {
        alert('Enter a phone number first.');
        return;
    }
    if (locationLog.length === 0) {
        alert('No log entries to send.');
        return;
    }

    localStorage.setItem('smsPhone', phone);

    const body = locationLog.map(entry => {
        const dt = new Date(entry.timestamp);
        const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `${dateStr} ${timeStr}\n${entry.address}`;
    }).join('\n\n');

    const smsBody = encodeURIComponent(`Location Log:\n\n${body}`);
    window.location.href = `sms:${phone}?body=${smsBody}`;
}
