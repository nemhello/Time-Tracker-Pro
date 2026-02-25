// ============================================================
// Time Tracker Pro - app.js
// Photos: fully local via IndexedDB (no server/auth required)
// ============================================================

let locationPhotos = {}, currentLocationPhotos = [], photoViewMode = false;
let photoDB = null;
let addressOverrides = {};

// State
let entries = [];
let activeEntry = null;
let timerInterval = null;
let selectedCategory = null;
let selectedLocation = null;
let pendingCodeSelection = null;
let currentCalendarDate = new Date();

// ── IndexedDB Setup ──────────────────────────────────────────
function openPhotoDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('TimeTrackerPhotoDB', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('photos')) {
                const store = db.createObjectStore('photos', { keyPath: 'id' });
                store.createIndex('locationName', 'locationName', { unique: false });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function loadPhotosFromDB() {
    return new Promise((resolve, reject) => {
        const tx = photoDB.transaction('photos', 'readonly');
        const store = tx.objectStore('photos');
        const req = store.getAll();
        req.onsuccess = () => {
            locationPhotos = {};
            req.result.forEach(photo => {
                if (!locationPhotos[photo.locationName]) locationPhotos[photo.locationName] = [];
                locationPhotos[photo.locationName].push(photo);
            });
            // sort each location's photos newest first
            Object.keys(locationPhotos).forEach(loc => {
                locationPhotos[loc].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            });
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

async function savePhotoToDB(photoRecord) {
    return new Promise((resolve, reject) => {
        const tx = photoDB.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        const req = store.put(photoRecord);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function deletePhotoFromDB(photoId) {
    return new Promise((resolve, reject) => {
        const tx = photoDB.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        const req = store.delete(photoId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function clearAllPhotosFromDB() {
    return new Promise((resolve, reject) => {
        const tx = photoDB.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

// ── Initialize ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof CATEGORIES === 'undefined') {
        console.error('CRITICAL: CATEGORIES not loaded!');
        alert('ERROR: Location data failed to load. Please refresh.');
        return;
    }
    console.log('✔ CATEGORIES loaded:', Object.keys(CATEGORIES).length, 'categories');

    try {
        photoDB = await openPhotoDB();
        await loadPhotosFromDB();
        console.log('✔ Photo DB ready');
    } catch (err) {
        console.error('IndexedDB failed, falling back to localStorage for photos:', err);
        loadPhotosLegacy();
    }

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
    loadAddressOverrides();
    renderCategories();
    renderEntries();
    updateCurrentDate();
    setupEventListeners();
    checkActiveEntry();
});

// ── Storage: Entries ─────────────────────────────────────────
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

// ── Address Overrides ────────────────────────────────────────
function loadAddressOverrides() {
    const stored = localStorage.getItem('addressOverrides');
    addressOverrides = stored ? JSON.parse(stored) : {};
}

function saveAddressOverrides() {
    localStorage.setItem('addressOverrides', JSON.stringify(addressOverrides));
}

function getAddress(locationName, staticAddress) {
    return addressOverrides[locationName] !== undefined ? addressOverrides[locationName] : (staticAddress || '');
}

function editAddress() {
    const current = getAddress(selectedLocation.name, selectedLocation.address);
    const newAddr = prompt(`Edit address for ${selectedLocation.name}:\n(Leave blank to remove)`, current);
    if (newAddr === null) return; // cancelled

    if (newAddr.trim() === '') {
        delete addressOverrides[selectedLocation.name];
    } else {
        addressOverrides[selectedLocation.name] = newAddr.trim();
    }
    saveAddressOverrides();

    // Update selectedLocation so timer/email picks it up
    selectedLocation.address = getAddress(selectedLocation.name, selectedLocation.address);

    // Show reminder banner
    const overrideCount = Object.keys(addressOverrides).length;
    if (overrideCount > 0) {
        const msg = `✔ Address saved!\n\n📌 Reminder: You have ${overrideCount} custom address${overrideCount !== 1 ? 'es' : ''} stored locally.\nTo make permanent, update locations.js in your repo.`;
        alert(msg);
    }

    renderLocationDetailsView();
}

// Legacy localStorage photo fallback
function loadPhotosLegacy() {
    const stored = localStorage.getItem('locationPhotos');
    locationPhotos = stored ? JSON.parse(stored) : {};
}

// ── Global Search ────────────────────────────────────────────
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

    const allMatches = [];
    const term = searchTerm.toLowerCase().trim();

    for (const [categoryName, locations] of Object.entries(CATEGORIES)) {
        if (!Array.isArray(locations)) continue;
        locations.filter(loc => {
            if (!loc || !loc.name) return false;
            return loc.name.toLowerCase().includes(term) ||
                (loc.chargeCodeSZ && loc.chargeCodeSZ.toLowerCase().includes(term)) ||
                (loc.chargeCodeMOS && loc.chargeCodeMOS.toLowerCase().includes(term));
        }).forEach(loc => {
            allMatches.push({ name: loc.name, chargeCodeSZ: loc.chargeCodeSZ, chargeCodeMOS: loc.chargeCodeMOS, address: loc.address || '', category: categoryName });
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

// ── Categories ───────────────────────────────────────────────
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

// ── Location List ────────────────────────────────────────────
function renderLocationList() {
    const list = document.getElementById('locationList');
    if (!selectedCategory) { list.innerHTML = ''; return; }

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
        </div>`;
    }).join('');
}

// ── Location Details ─────────────────────────────────────────
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

    // Always rebuild card to recover from showPhotoGallery() wiping it
    const detailsCard = document.querySelector('#locationDetails .details-card');
    if (detailsCard) {
        detailsCard.innerHTML = `
            <div class="details-location" id="detailsLocation"></div>
            <div class="details-code" id="detailsChargeCode"></div>
            <div id="detailsAddress" class="details-address"></div>
            <div class="details-buttons"></div>
        `;
    }

    document.getElementById('detailsLocation').textContent = selectedLocation.name;
    document.getElementById('detailsChargeCode').textContent = selectedLocation.chargeCodeSZ || 'No charge code';

    const resolvedAddress = getAddress(selectedLocation.name, selectedLocation.address);
    const addressDiv = document.getElementById('detailsAddress');
    if (resolvedAddress && resolvedAddress.trim() !== '') {
        addressDiv.innerHTML = `
            <div class="address-container">
                <a class="address-link" href="https://maps.apple.com/?q=${encodeURIComponent(resolvedAddress)}" target="_blank">📍 ${resolvedAddress}</a>
                <button class="btn-edit-address" onclick="editAddress()">Edit</button>
            </div>`;
        addressDiv.style.display = 'block';
    } else {
        addressDiv.innerHTML = `<button class="btn-add-address" onclick="editAddress()">+ Add Address</button>`;
        addressDiv.style.display = 'block';
    }

    const buttonsDiv = document.querySelector('#locationDetails .details-buttons');
    let html = '';

    if (lastVisit && photoCount > 0) {
        html += `<div class="photo-info-banner">Last visit: ${lastVisit} &bull; ${photoCount} photo${photoCount !== 1 ? 's' : ''}</div>`;
    }

    if (photoCount > 0) {
        html += `<button class="btn btn-primary" onclick="togglePhotoView()">&#128248; View Photos (${photoCount})</button>`;
    } else {
        html += `<button class="btn btn-primary" onclick="togglePhotoView()">&#128247; Add Photos</button>`;
    }

    html += `
        <button class="btn btn-email" onclick="emailDispatchStart()">&#128231; Email Dispatch to Start</button>
        <button class="btn btn-primary" onclick="confirmStartTimer()">&#9654; Start Timer</button>
    `;

    buttonsDiv.innerHTML = html;
}

function getLastVisitDate(locationName) {
    const locationEntries = entries.filter(e => e.location === locationName);
    if (locationEntries.length === 0) return null;
    locationEntries.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    const date = new Date(locationEntries[0].startTime);
    const diffDays = Math.floor((new Date() - date) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
}

function getLocationPhotos(locationName) {
    return locationPhotos[locationName] || [];
}

async function addPhotoToLocation(locationName, photoRecord) {
    if (!locationPhotos[locationName]) locationPhotos[locationName] = [];
    locationPhotos[locationName].unshift(photoRecord);

    if (photoDB) {
        await savePhotoToDB(photoRecord);
    } else {
        // fallback to localStorage (without image data to avoid size limit)
        const meta = Object.fromEntries(
            Object.entries(locationPhotos).map(([k, v]) => [k, v.map(p => ({ ...p, dataUrl: undefined }))])
        );
        localStorage.setItem('locationPhotos', JSON.stringify(meta));
    }
}

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

// ── Photo Gallery ────────────────────────────────────────────
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
            <input type="file" id="photoCameraInput" accept="image/*" capture="environment" style="display:none;" onchange="handlePhotoFile(event)">
            <input type="file" id="photoFileInput" accept="image/*" style="display:none;" onchange="handlePhotoFile(event)">
            <button class="btn btn-primary btn-capture" onclick="document.getElementById('photoCameraInput').click()">📷 Take Photo</button>
            <button class="btn btn-secondary" onclick="document.getElementById('photoFileInput').click()">📁 Upload Photo</button>
        </div>
        <div class="photo-gallery" id="photoGalleryGrid">
            ${renderPhotoGrid()}
        </div>
        <div class="details-buttons">
            <button class="btn btn-secondary" onclick="togglePhotoView()">⏱️ Back to Timer</button>
        </div>
    `;
}

function renderPhotoGrid() {
    if (currentLocationPhotos.length === 0) {
        return '<div class="no-photos">No photos yet. Take your first photo!</div>';
    }
    return currentLocationPhotos.map((photo, index) => `
        <div class="photo-card" onclick="viewFullPhoto(${index})">
            <img src="${photo.dataUrl || photo.url}" alt="Photo ${index + 1}" loading="lazy">
            <div class="photo-overlay">
                <div class="photo-date">${formatPhotoDate(photo.timestamp)}</div>
                📱
            </div>
        </div>
    `).join('');
}

function formatPhotoDate(timestamp) {
    const date = new Date(timestamp);
    const diffMs = new Date() - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

// ── Photo Capture ────────────────────────────────────────────
async function capturePhoto() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;

        const overlay = document.createElement('div');
        overlay.className = 'camera-overlay';
        overlay.innerHTML = `
            <div class="camera-container">
                <div class="camera-preview"></div>
                <div class="camera-controls">
                    <button class="btn btn-secondary" id="cancelCapture">Cancel</button>
                    <button class="btn btn-primary" id="captureButton">📷 Capture</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.querySelector('.camera-preview').appendChild(video);

        await new Promise((resolve) => {
            video.onloadedmetadata = () => { video.play(); resolve(); };
        });

        document.getElementById('captureButton').onclick = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            stream.getTracks().forEach(t => t.stop());
            document.body.removeChild(overlay);
            canvas.toBlob(async (blob) => {
                if (blob) await savePhotoLocally(blob);
            }, 'image/jpeg', 0.85);
        };

        document.getElementById('cancelCapture').onclick = () => {
            stream.getTracks().forEach(t => t.stop());
            document.body.removeChild(overlay);
        };

    } catch (error) {
        console.error('Camera error:', error);
        alert('❌ Camera access denied or unavailable.\n\nTry uploading a photo instead.');
    }
}

async function handlePhotoFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('❌ Please select an image file.');
        return;
    }
    await savePhotoLocally(file);
    event.target.value = '';
}

// ── Local Photo Save (replaces server upload) ────────────────
async function savePhotoLocally(blob) {
    showLoadingIndicator('Saving photo...');
    try {
        const dataUrl = await blobToBase64(blob);
        const photoRecord = {
            id: Date.now().toString(),
            locationName: selectedLocation.name,
            dataUrl: dataUrl,
            url: dataUrl,          // keep url alias for viewer compatibility
            timestamp: new Date().toISOString(),
            storage: 'local'
        };

        await addPhotoToLocation(selectedLocation.name, photoRecord);
        currentLocationPhotos = getLocationPhotos(selectedLocation.name);

        hideLoadingIndicator();

        if (photoViewMode) showPhotoGallery();

    } catch (error) {
        console.error('Save failed:', error);
        hideLoadingIndicator();
        alert('❌ Photo save failed.\n\n' + error.message);
    }
}

function showLoadingIndicator(message) {
    if (document.getElementById('loadingIndicator')) return;
    const el = document.createElement('div');
    el.id = 'loadingIndicator';
    el.className = 'loading-indicator';
    el.innerHTML = `<div class="loading-content"><div class="spinner"></div><div>${message}</div></div>`;
    document.body.appendChild(el);
}

function hideLoadingIndicator() {
    const el = document.getElementById('loadingIndicator');
    if (el) document.body.removeChild(el);
}

// ── Photo Viewer ─────────────────────────────────────────────
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
            <img src="${photo.dataUrl || photo.url}" alt="Photo">
            <div class="photo-viewer-footer">
                <div>${selectedLocation.name}</div>
                <div>${new Date(photo.timestamp).toLocaleString()}</div>
                <div>📱 Local</div>
            </div>
            <div class="photo-viewer-nav">
                ${index > 0 ? `<button onclick="closePhotoViewer();viewFullPhoto(${index - 1})">← Previous</button>` : '<div></div>'}
                <button class="btn-delete" onclick="deletePhoto(${index})">🗑️ Delete</button>
                ${index < currentLocationPhotos.length - 1 ? `<button onclick="closePhotoViewer();viewFullPhoto(${index + 1})">Next →</button>` : '<div></div>'}
            </div>
        </div>
    `;
    document.body.appendChild(viewer);
}

function closePhotoViewer() {
    const viewer = document.querySelector('.photo-viewer-overlay');
    if (viewer) document.body.removeChild(viewer);
}

async function deletePhoto(index) {
    if (!confirm('Delete this photo?')) return;

    const photo = currentLocationPhotos[index];

    currentLocationPhotos.splice(index, 1);
    locationPhotos[selectedLocation.name] = currentLocationPhotos;

    if (photoDB && photo.id) {
        await deletePhotoFromDB(photo.id);
    }

    closePhotoViewer();
    if (photoViewMode) showPhotoGallery();
}

// ── Email & Code Modal ───────────────────────────────────────
function emailDispatchStart() {
    if (!selectedLocation || selectedLocation.name === 'Training') return;
    showCodeModal('start');
}

function showCodeModal(action) {
    const modal = document.getElementById('codeModal');
    document.getElementById('szCodeValue').textContent = selectedLocation.chargeCodeSZ || 'Not available';
    document.getElementById('mosCodeValue').textContent = selectedLocation.chargeCodeMOS || 'Not available';
    document.getElementById('useSZCode').disabled = !selectedLocation.chargeCodeSZ;
    document.getElementById('useMOSCode').disabled = !selectedLocation.chargeCodeMOS;
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
        setTimeout(() => finishEntry(), 300);
    }
}

function sendStartEmail(code) {
    const body = `Please open a ticket to start work at ${selectedLocation.name}`;
    window.location.href = `mailto:dispatch@motorolasolutions.com?subject=${encodeURIComponent(code)}&body=${encodeURIComponent(body)}`;
}

function sendStopEmail(code) {
    const body = `All work at ${selectedLocation.name} is finished, please close this ticket.`;
    window.location.href = `mailto:dispatch@motorolasolutions.com?subject=${encodeURIComponent(code)}&body=${encodeURIComponent(body)}`;
}

// ── Timer ────────────────────────────────────────────────────
function confirmStartTimer() {
    if (!selectedLocation) return;
    const now = new Date();
    activeEntry = {
        id: now.getTime(),
        location: selectedLocation.name,
        chargeCodeSZ: selectedLocation.chargeCodeSZ,
        chargeCodeMOS: selectedLocation.chargeCodeMOS,
        address: getAddress(selectedLocation.name, selectedLocation.address),
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
        const diff = new Date() - new Date(activeEntry.startTime);
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        document.getElementById('timerDisplay').textContent =
            `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
}

function stopTimer() {
    if (!activeEntry) return;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    activeEntry.endTime = new Date().toISOString();
    activeEntry.workOrder = document.getElementById('workOrderField').value.trim();
    activeEntry.notes = document.getElementById('notesField').value;

    if (activeEntry.location === 'Training') {
        entries.push(activeEntry);
        saveEntries();
        activeEntry = null;
        saveActiveEntry();
        hideActiveTimer();
        renderEntries();
        return;
    }

    selectedLocation = {
        name: activeEntry.location,
        chargeCodeSZ: activeEntry.chargeCodeSZ,
        chargeCodeMOS: activeEntry.chargeCodeMOS,
        address: activeEntry.address
    };

    showCodeModal('stop');
}

function finishEntry() {
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

// ── Entries ──────────────────────────────────────────────────
function renderEntries() {
    const list = document.getElementById('entriesList');
    const today = new Date().toDateString();
    const todayEntries = entries.filter(e => new Date(e.startTime).toDateString() === today);

    if (todayEntries.length === 0) {
        list.innerHTML = '<div class="no-entries">No entries today</div>';
        document.getElementById('totalHours').textContent = '';
        return;
    }

    list.innerHTML = todayEntries.map(entry => {
        const start = new Date(entry.startTime);
        const end = new Date(entry.endTime);
        return `
            <div class="entry-card">
                <div class="entry-header">
                    <div class="entry-location">${entry.location}</div>
                    <div class="entry-actions">
                        <button class="btn-edit" onclick="editEntry('${entry.id}')">Edit Time</button>
                        <button class="btn-edit" onclick="editDetails('${entry.id}')">Details</button>
                        <button class="btn-delete" onclick="deleteEntry('${entry.id}')">&#128465;</button>
                    </div>
                </div>
                ${entry.chargeCodeSZ ? `<div class="entry-code">${entry.chargeCodeSZ}</div>` : ''}
                ${entry.workOrder ? `<div class="entry-workorder">WO #${entry.workOrder}</div>` : ''}
                <div class="entry-time">${formatTime(start)} - ${formatTime(end)}</div>
                <div class="entry-duration">${formatDuration(end - start)}</div>
                ${entry.notes ? `<div class="entry-notes">📝 ${entry.notes}</div>` : ''}
            </div>
        `;
    }).join('');

    const totalMs = todayEntries.reduce((sum, e) => sum + (new Date(e.endTime) - new Date(e.startTime)), 0);
    document.getElementById('totalHours').innerHTML = `<div class="total-hours">Total: ${formatDuration(totalMs)}</div>`;
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

    const newStart = prompt(`Edit start time (HH:MM):\nCurrent: ${startStr}`, startStr);
    if (!newStart) return;
    const newEnd = prompt(`Edit end time (HH:MM):\nCurrent: ${endStr}`, endStr);
    if (!newEnd) return;

    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(newStart) || !timeRegex.test(newEnd)) {
        alert('Invalid time format. Use HH:MM\nExample: 08:30 or 14:45');
        return;
    }

    const [sh, sm] = newStart.split(':').map(Number);
    const [eh, em] = newEnd.split(':').map(Number);

    const newStartDate = new Date(start); newStartDate.setHours(sh, sm, 0, 0);
    const newEndDate = new Date(end); newEndDate.setHours(eh, em, 0, 0);

    if (newEndDate <= newStartDate) { alert('End time must be after start time'); return; }

    entry.startTime = newStartDate.toISOString();
    entry.endTime = newEndDate.toISOString();
    saveEntries();
    renderEntries();
}

function editDetails(id) {
    const entry = entries.find(e => String(e.id) === String(id));
    if (!entry) return;

    const newWO = prompt(`Edit Work Order # for ${entry.location}:\n(Leave blank if none)`, entry.workOrder || '');
    if (newWO === null) return;
    const newNotes = prompt(`Edit notes for ${entry.location}:`, entry.notes || '');
    if (newNotes === null) return;

    entry.workOrder = newWO.trim();
    entry.notes = newNotes.trim();
    saveEntries();
    renderEntries();
}

// ── Calendar ─────────────────────────────────────────────────
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
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const datesWithEntries = new Set();
    entries.forEach(e => {
        const d = new Date(e.startTime);
        if (d.getFullYear() === year && d.getMonth() === month) datesWithEntries.add(d.getDate());
    });

    let html = `
        <div class="calendar-nav">
            <button onclick="previousMonth()">← Previous</button>
            <div class="calendar-month-header">${monthNames[month]} ${year}</div>
            <button onclick="nextMonth()">Next →</button>
        </div>
        <div class="calendar-month">
    `;

    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
        html += `<div class="calendar-day-header">${d}</div>`;
    });

    for (let i = 0; i < firstDay; i++) html += '<div class="calendar-day empty"></div>';

    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (datesWithEntries.has(day)) classes += ' has-entries';
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
    const dateString = new Date(year, month, day).toDateString();
    const dateEntries = entries.filter(e => new Date(e.startTime).toDateString() === dateString);
    if (dateEntries.length === 0) return;

    document.getElementById('selectedDateTitle').textContent =
        new Date(year, month, day).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    document.getElementById('selectedDateEntries').innerHTML = dateEntries.map(entry => {
        const start = new Date(entry.startTime);
        const end = new Date(entry.endTime);
        return `
            <div class="entry-card">
                <div class="entry-header">
                    <div class="entry-location">${entry.location}</div>
                    <div class="entry-actions">
                        <button class="btn-edit" onclick="editEntry('${entry.id}')">Edit Time</button>
                        <button class="btn-edit" onclick="editDetails('${entry.id}')">Details</button>
                        <button class="btn-delete" onclick="deleteEntry('${entry.id}');showDateEntries(${year},${month},${day})">&#128465;</button>
                    </div>
                </div>
                ${entry.chargeCodeSZ ? `<div class="entry-code">${entry.chargeCodeSZ}</div>` : ''}
                ${entry.workOrder ? `<div class="entry-workorder">WO #${entry.workOrder}</div>` : ''}
                <div class="entry-time">${formatTime(start)} - ${formatTime(end)}</div>
                <div class="entry-duration">${formatDuration(end - start)}</div>
                ${entry.notes ? `<div class="entry-notes">📝 ${entry.notes}</div>` : ''}
            </div>
        `;
    }).join('');

    document.getElementById('pastEntriesDetail').classList.remove('hidden');
}

// ── Event Listeners ──────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('globalSearchBox').addEventListener('input', e => handleGlobalSearch(e.target.value));
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
    document.getElementById('skipEmailBtn').addEventListener('click', skipEmailAndFinish);
    document.getElementById('cancelCodeModal').addEventListener('click', hideCodeModal);

    const workOrderField = document.getElementById('workOrderField');
    if (workOrderField) {
        workOrderField.addEventListener('input', e => {
            if (activeEntry) { activeEntry.workOrder = e.target.value.trim(); saveActiveEntry(); }
        });
    }

    const notesField = document.getElementById('notesField');
    if (notesField) {
        notesField.addEventListener('input', e => {
            if (activeEntry) { activeEntry.notes = e.target.value; saveActiveEntry(); }
        });
    }
}

function skipEmailAndFinish() {
    const action = pendingCodeSelection;
    hideCodeModal();
    if (action === 'stop') finishEntry();
}

function updateCurrentDate() {
    document.getElementById('currentDate').textContent =
        new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Export / Import ──────────────────────────────────────────
async function exportData() {
    // Pull all photos including base64 from IndexedDB
    let allPhotos = {};
    if (photoDB) {
        await new Promise((resolve) => {
            const tx = photoDB.transaction('photos', 'readonly');
            const req = tx.objectStore('photos').getAll();
            req.onsuccess = () => {
                req.result.forEach(p => {
                    if (!allPhotos[p.locationName]) allPhotos[p.locationName] = [];
                    allPhotos[p.locationName].push(p);
                });
                resolve();
            };
        });
    } else {
        allPhotos = locationPhotos;
    }

    const data = {
        entries,
        photos: allPhotos,
        addressOverrides,
        exportDate: new Date().toISOString(),
        version: 'v4.1.1'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-tracker-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert(`✔ Backup saved!\n\nIncludes time entries + ${Object.keys(allPhotos).length} location photo sets.`);
}

async function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!data.entries || !Array.isArray(data.entries)) {
                    alert('❌ Invalid backup file');
                    return;
                }

                if (!confirm(`Import ${data.entries.length} entries?\n\nThis will REPLACE your current data.\n\nExported: ${new Date(data.exportDate).toLocaleString()}`)) return;

                entries = data.entries;
                saveEntries();

                if (data.addressOverrides) {
                    addressOverrides = data.addressOverrides;
                    saveAddressOverrides();
                }

                if (data.photos && photoDB) {
                    await clearAllPhotosFromDB();
                    locationPhotos = {};
                    for (const [locName, photos] of Object.entries(data.photos)) {
                        for (const photo of photos) {
                            await savePhotoToDB({ ...photo, locationName: locName });
                        }
                    }
                    await loadPhotosFromDB();
                } else if (data.photos) {
                    locationPhotos = data.photos;
                }

                renderEntries();
                alert(`✔ Imported ${entries.length} entries successfully!`);
            } catch (err) {
                alert('❌ Error reading backup file: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

// ── Utilities ────────────────────────────────────────────────
function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
