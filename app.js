const CONFIG = { apiUrl: 'https://field-api.wilkerson-labs.com' };
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
let photoViewContext = null; // Track if viewing from 'timer' or 'details'
let isTransitioning = false; // Prevent rapid clicks

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
    // DON'T load photos yet - wait until user clicks "View Photos"
    currentLocationPhotos = [];
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
    
    // Only get photo count, not actual photos
    const photoCount = getLocationPhotos(selectedLocation.name).length;
    const lastVisit = getLastVisitDate(selectedLocation.name);
    
    const detailsCard = document.querySelector('#locationDetails .details-card');
    if (!detailsCard) return;
    
    // Rebuild full structure (in case coming from photo gallery)
    let html = `
        <div class="details-location" id="detailsLocation">${selectedLocation.name}</div>
        <div class="details-code" id="detailsChargeCode">${selectedLocation.chargeCodeSZ || 'No charge code'}</div>
    `;
    
    if (selectedLocation.address && selectedLocation.address.trim() !== '') {
        html += `<div id="detailsAddress" class="details-address" style="display: block;">
            <a href="https://maps.apple.com/?q=${encodeURIComponent(selectedLocation.address)}" target="_blank">📍 ${selectedLocation.address}</a>
        </div>`;
    } else {
        html += `<div id="detailsAddress" class="details-address" style="display: none;"></div>`;
    }
    
    html += '<div class="details-buttons">';
    
    if (lastVisit && photoCount > 0) {
        html += `<div class="photo-info-banner">Last visit: ${lastVisit} • ${photoCount} photo${photoCount !== 1 ? 's' : ''}</div>`;
    }
    
    if (authToken && photoCount > 0) {
        html += `<button class="btn btn-primary" onclick="togglePhotoView()">📸 View Photos (${photoCount})</button>`;
    } else if (authToken) {
        html += `<button class="btn btn-primary" onclick="togglePhotoView()">📷 Add Photos</button>`;
    }
    
    html += `
        <button class="btn btn-email" onclick="emailDispatchStart()">📧 Email Dispatch</button>
        <button class="btn btn-primary" onclick="confirmStartTimer()">▶️ Start Timer</button>
    `;
    
    html += '</div>';
    
    detailsCard.innerHTML = html;
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

function getLocationPhotos(locationName) {
    return locationPhotos[locationName] || [];
}

function addPhotoToLocation(locationName, photoData) {
    if (!locationPhotos[locationName]) {
        locationPhotos[locationName] = [];
    }
    locationPhotos[locationName].unshift(photoData);
    savePhotos();
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

// Photo Gallery
function togglePhotoView() {
    // Prevent rapid clicks
    if (isTransitioning) return;
    isTransitioning = true;
    setTimeout(() => isTransitioning = false, 500);
    
    photoViewMode = !photoViewMode;
    
    if (photoViewMode) {
        // NOW load photos (only when user clicks "View Photos")
        currentLocationPhotos = getLocationPhotos(selectedLocation.name);
        
        // Track where we're coming from
        photoViewContext = activeEntry ? 'timer' : 'details';
        
        // If coming from timer, need to show locationDetails first
        if (photoViewContext === 'timer') {
            document.getElementById('activeTimer').classList.add('hidden');
            document.getElementById('locationDetails').classList.remove('hidden');
        }
        
        showPhotoGallery();
    } else {
        // Clear photos from memory FIRST
        currentLocationPhotos = [];
        
        // Return to where we came from
        if (photoViewContext === 'timer' && activeEntry) {
            // Going back to timer - force clean state
            const locationDetails = document.getElementById('locationDetails');
            const activeTimer = document.getElementById('activeTimer');
            
            // Reset location details
            locationDetails.classList.add('hidden');
            
            // Show timer
            activeTimer.classList.remove('hidden');
            
            // Reset selected location
            selectedLocation = null;
        } else {
            // Rebuild location details view
            renderLocationDetailsView();
        }
        
        photoViewContext = null;
        photoViewMode = false;
    }
}

function showPhotoGallery() {
    if (!authToken) {
        alert('❌ Photo features require authentication.');
        return;
    }
    
    const detailsCard = document.querySelector('#locationDetails .details-card');
    if (!detailsCard) return;
    
    const buttonText = photoViewContext === 'timer' ? '⏱️ Back to Timer' : '⬅️ Back';
    
    // Show INSTANT loading state (no delay)
    detailsCard.innerHTML = `
        <div class="photo-gallery-header">
            <h2>📸 ${selectedLocation.name}</h2>
            <p>Loading...</p>
        </div>
        <div style="text-align: center; padding: 60px 20px;">
            <div class="spinner"></div>
        </div>
    `;
    
    // Defer heavy work to next frame (keeps UI responsive)
    requestAnimationFrame(() => {
        detailsCard.innerHTML = `
            <div class="photo-gallery-header">
                <h2>📸 ${selectedLocation.name}</h2>
                <p>${currentLocationPhotos.length} photo${currentLocationPhotos.length !== 1 ? 's' : ''}</p>
            </div>
            
            <div class="photo-capture-section">
                <input type="file" id="photoFileInput" accept="image/*" multiple style="display: none;" onchange="handlePhotoFile(event)">
                <button class="btn btn-primary btn-upload-full" onclick="document.getElementById('photoFileInput').click()">
                    📁 Upload Photos from Library
                </button>
                <p class="upload-hint">💡 Tip: Use your iPhone Camera app for best quality, then upload here</p>
            </div>
            
            <div class="photo-gallery" id="photoGalleryGrid">
                ${currentLocationPhotos.length > 0 ? '<div class="loading-photos">⏳ Loading...</div>' : '<div class="no-photos">No photos yet. Take your first photo!</div>'}
            </div>
            
            <div class="details-buttons">
                <button class="btn btn-secondary" onclick="togglePhotoView()">${buttonText}</button>
            </div>
        `;
        
        // Load photos progressively
        if (currentLocationPhotos.length > 0) {
            setTimeout(() => {
                const grid = document.getElementById('photoGalleryGrid');
                if (grid) grid.innerHTML = renderPhotoGrid();
            }, 50);
        }
    });
}

function renderPhotoGrid() {
    if (currentLocationPhotos.length === 0) {
        return '<div class="no-photos">No photos yet. Take your first photo!</div>';
    }
    
    return currentLocationPhotos.map((photo, index) => `
        <div class="photo-card" onclick="viewFullPhoto(${index})">
            <div class="photo-spinner-placeholder">
                <div class="spinner-small"></div>
            </div>
            <img 
                src="${photo.url}" 
                alt="Photo ${index + 1}" 
                loading="lazy"
                onload="this.style.opacity='1'; this.previousElementSibling.style.display='none';"
                onerror="this.previousElementSibling.innerHTML='❌ Error'; this.style.display='none';"
                style="opacity: 0; transition: opacity 0.3s;">
            <div class="photo-overlay">
                <div class="photo-date">${formatPhotoDate(photo.timestamp)}</div>
                ${photo.storage === 'immich' ? '🏠' : photo.storage === 'cloudinary' ? '☁️' : '📱'}
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

// Photo Capture
// Camera capture removed - use native iPhone Camera app instead

async function handlePhotoFile(event) {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;
    
    // Validate all files are images
    const invalidFiles = files.filter(f => !f.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
        alert(`❌ ${invalidFiles.length} file(s) are not images. Only image files allowed.`);
        return;
    }
    
    // Upload multiple files
    if (files.length > 1) {
        await uploadMultiplePhotos(files);
    } else {
        await uploadPhoto(files[0]);
    }
    
    event.target.value = '';
}

async function uploadMultiplePhotos(files) {
    const total = files.length;
    let success = 0;
    let failed = 0;
    
    // Show progress indicator
    showLoadingIndicator(`Uploading 0 / ${total} photos...`);
    
    for (let i = 0; i < files.length; i++) {
        try {
            // Update progress
            const progressDiv = document.querySelector('.loading-indicator .loading-content div:last-child');
            if (progressDiv) {
                progressDiv.textContent = `Uploading ${i + 1} / ${total} photos...`;
            }
            
            // Upload in silent mode
            await uploadPhoto(files[i], true);
            success++;
        } catch (error) {
            console.error(`Failed to upload ${files[i].name}:`, error);
            failed++;
        }
    }
    
    hideLoadingIndicator();
    
    // Refresh gallery once at the end
    currentLocationPhotos = getLocationPhotos(selectedLocation.name);
    if (photoViewMode) {
        const grid = document.getElementById('photoGalleryGrid');
        if (grid) grid.innerHTML = renderPhotoGrid();
    } else if (activeEntry) {
        updateTimerPhotoSection();
    }
    
    // Show summary
    if (failed === 0) {
        alert(`✅ Uploaded ${success} photo${success !== 1 ? 's' : ''} successfully!`);
    } else {
        alert(`⚠️ Uploaded ${success} photo${success !== 1 ? 's' : ''}.\n${failed} failed.`);
    }
}

// Photo Upload - FIXED: Use backend proxy URL
async function uploadPhoto(photoBlob, silent = false) {
    if (!authToken) {
        if (!silent) alert('❌ Authentication required for photo upload.');
        throw new Error('Authentication required');
    }
    
    if (!silent) showLoadingIndicator('Uploading photo...');
    
    try {
        const formData = new FormData();
        formData.append('photo', photoBlob, `${selectedLocation.name}-${Date.now()}.jpg`);
        
        const response = await fetch(`${CONFIG.apiUrl}/api/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Upload result:', result);
        
        const photoData = {
            id: Date.now().toString(),
            storage: result.storage,
            assetId: result.assetId || result.cloudinaryId,
            url: result.url,  // Backend now returns proxied URL
            fullUrl: result.fullUrl || result.url,
            timestamp: result.timestamp || new Date().toISOString(),
            location: selectedLocation.name,
            needsSync: result.needsSync || false
        };
        
        addPhotoToLocation(selectedLocation.name, photoData);
        
        // Only update UI if not in silent mode
        if (!silent) {
            currentLocationPhotos = getLocationPhotos(selectedLocation.name);
            hideLoadingIndicator();
            
            if (photoViewMode) {
                showPhotoGallery();
            } else if (activeEntry) {
                updateTimerPhotoSection();
            }
            
            alert(`✅ Photo uploaded to ${result.storage}!`);
        }
        
        return photoData;
        
    } catch (error) {
        console.error('Upload failed:', error);
        if (!silent) {
            hideLoadingIndicator();
            alert('❌ Photo upload failed.\n\n' + error.message);
        }
        throw error;
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
            <div class="photo-viewer-image-container" id="photoViewerContainer">
                <img 
                    class="photo-viewer-thumbnail" 
                    src="${photo.url}" 
                    alt="Loading..."
                    style="filter: blur(5px); opacity: 0.7;">
                <img 
                    id="photoViewerImage"
                    class="photo-viewer-fullres" 
                    src="${photo.fullUrl || photo.url}" 
                    alt="Photo"
                    style="opacity: 0; transform-origin: center center;"
                    onload="this.style.opacity='1'; this.previousElementSibling.style.display='none';"
                    onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Crect fill=%22%23222%22 width=%22400%22 height=%22400%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2220%22%3EImage Failed to Load%3C/text%3E%3C/svg%3E'">
            </div>
            <div class="photo-viewer-footer">
                <div>${selectedLocation.name}</div>
                <div>${new Date(photo.timestamp).toLocaleString()}</div>
                <div>${photo.storage === 'immich' ? '🏠 Immich' : photo.storage === 'cloudinary' ? '☁️ Cloudinary' : '📱 Local'}</div>
                <button class="btn-open-photos" onclick="openInPhotos('${photo.fullUrl || photo.url}')">📱 Open in Photos App</button>
            </div>
            <div class="photo-viewer-nav">
                ${index > 0 ? `<button onclick="viewFullPhoto(${index - 1})">← Previous</button>` : '<div></div>'}
                <button class="btn-delete" onclick="deletePhoto(${index})">🗑️ Delete</button>
                ${index < currentLocationPhotos.length - 1 ? `<button onclick="viewFullPhoto(${index + 1})">Next →</button>` : '<div></div>'}
            </div>
        </div>
    `;
    
    document.body.appendChild(viewer);
    
    // Initialize native-like zoom gestures
    setTimeout(() => initPhotoZoom(), 100);
}

// Native-like zoom and pan functionality
function initPhotoZoom() {
    const img = document.getElementById('photoViewerImage');
    const container = document.getElementById('photoViewerContainer');
    
    if (!img || !container) return;
    
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let lastTouchDistance = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let lastTap = 0;
    
    function updateTransform() {
        img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
    
    function resetTransform() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    }
    
    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Double-tap to zoom
    img.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTap < 300) {
            e.preventDefault();
            if (scale === 1) {
                scale = 2.5;
            } else {
                resetTransform();
            }
            updateTransform();
        }
        lastTap = now;
    });
    
    // Pinch to zoom
    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            lastTouchDistance = getTouchDistance(e.touches);
        } else if (e.touches.length === 1 && scale > 1) {
            isDragging = true;
            startX = e.touches[0].clientX - translateX;
            startY = e.touches[0].clientY - translateY;
        }
    });
    
    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const distance = getTouchDistance(e.touches);
            const delta = distance / lastTouchDistance;
            scale = Math.max(1, Math.min(5, scale * delta));
            lastTouchDistance = distance;
            updateTransform();
        } else if (e.touches.length === 1 && isDragging && scale > 1) {
            e.preventDefault();
            translateX = e.touches[0].clientX - startX;
            translateY = e.touches[0].clientY - startY;
            
            // Limit dragging to image bounds
            const maxTranslate = (img.offsetWidth * (scale - 1)) / 2;
            const maxTranslateY = (img.offsetHeight * (scale - 1)) / 2;
            translateX = Math.max(-maxTranslate, Math.min(maxTranslate, translateX));
            translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));
            
            updateTransform();
        }
    });
    
    container.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            isDragging = false;
            if (scale === 1) {
                translateX = 0;
                translateY = 0;
                updateTransform();
            }
        } else if (e.touches.length === 1) {
            lastTouchDistance = 0;
        }
    });
    
    // Desktop: mouse wheel zoom
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scale = Math.max(1, Math.min(5, scale * delta));
        if (scale === 1) {
            translateX = 0;
            translateY = 0;
        }
        updateTransform();
    });
    
    // Desktop: click and drag
    let mouseDown = false;
    container.addEventListener('mousedown', (e) => {
        if (scale > 1) {
            mouseDown = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            container.style.cursor = 'grabbing';
        }
    });
    
    container.addEventListener('mousemove', (e) => {
        if (mouseDown && scale > 1) {
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        }
    });
    
    container.addEventListener('mouseup', () => {
        mouseDown = false;
        container.style.cursor = scale > 1 ? 'grab' : 'default';
    });
    
    container.addEventListener('mouseleave', () => {
        mouseDown = false;
        container.style.cursor = 'default';
    });
}

function closePhotoViewer() {
    const viewer = document.querySelector('.photo-viewer-overlay');
    if (viewer) {
        document.body.removeChild(viewer);
    }
}

function deletePhoto(index) {
    if (!confirm('Delete this photo?')) return;
    
    currentLocationPhotos.splice(index, 1);
    locationPhotos[selectedLocation.name] = currentLocationPhotos;
    savePhotos();
    
    closePhotoViewer();
    
    if (photoViewMode) {
        showPhotoGallery();
    } else if (activeEntry) {
        updateTimerPhotoSection();
    }
    
    alert('✓ Photo deleted');
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

// Timer - WITH PHOTO SECTION
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
    
    // Add photo section to timer
    updateTimerPhotoSection();
}

function updateTimerPhotoSection() {
    if (!activeEntry) return;
    
    currentLocationPhotos = getLocationPhotos(activeEntry.location);
    const photoCount = currentLocationPhotos.length;
    
    let photoSection = document.getElementById('timerPhotoSection');
    if (!photoSection) {
        photoSection = document.createElement('div');
        photoSection.id = 'timerPhotoSection';
        photoSection.className = 'timer-photo-section';
        
        const stopBtn = document.getElementById('stopBtn');
        stopBtn.parentNode.insertBefore(photoSection, stopBtn);
    }
    
    if (authToken) {
        photoSection.innerHTML = `
            <div class="timer-photo-buttons">
                <button class="btn btn-primary" onclick="capturePhotoFromTimer()">📷 Take Photo</button>
                ${photoCount > 0 ? `<button class="btn btn-secondary" onclick="viewPhotosFromTimer()">📸 View Photos (${photoCount})</button>` : ''}
            </div>
        `;
    } else {
        photoSection.innerHTML = '';
    }
}

function capturePhotoFromTimer() {
    selectedLocation = {
        name: activeEntry.location,
        chargeCodeSZ: activeEntry.chargeCodeSZ,
        chargeCodeMOS: activeEntry.chargeCodeMOS,
        address: activeEntry.address
    };
    capturePhoto();
}

function viewPhotosFromTimer() {
    selectedLocation = {
        name: activeEntry.location,
        chargeCodeSZ: activeEntry.chargeCodeSZ,
        chargeCodeMOS: activeEntry.chargeCodeMOS,
        address: activeEntry.address
    };
    currentLocationPhotos = getLocationPhotos(activeEntry.location);
    
    // Show modal with photos
    const modal = document.createElement('div');
    modal.className = 'photo-modal-overlay';
    modal.innerHTML = `
        <div class="photo-modal">
            <div class="photo-modal-header">
                <h2>📸 ${activeEntry.location} Photos</h2>
                <button onclick="closePhotoModal()">✕ Close</button>
            </div>
            <div class="photo-gallery" style="max-height: 60vh; overflow-y: auto;">
                ${renderPhotoGrid()}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closePhotoModal() {
    const modal = document.querySelector('.photo-modal-overlay');
    if (modal) {
        document.body.removeChild(modal);
    }
    // Clear state completely
    currentLocationPhotos = [];
    selectedLocation = null;
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
    const action = pendingCodeSelection;
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

// Export/Import - WITH PHOTOS
function exportData() {
    const data = {
        entries: entries,
        photos: locationPhotos,
        exportDate: new Date().toISOString(),
        version: 'v4.0.0-pro'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `field-assistant-backup-${date}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    alert(`✓ Backup saved: ${filename}\n\nIncludes time entries and photo metadata.`);
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
                    
                    if (data.photos) {
                        locationPhotos = data.photos;
                        savePhotos();
                    }
                    
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

// Authentication
async function checkAuthentication() {
    if (!authToken) return false;
    if (authExpiry && new Date(authExpiry) < new Date()) return false;
    try {
        const res = await fetch(`${CONFIG.apiUrl}/auth/validate`, {
            method: 'POST', 
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        return res.ok;
    } catch { 
        return false; 
    }
}

async function showLoginPrompt() {
    const pass = prompt('🔒 Password (Cancel=timer-only):');
    if (!pass) return false;
    try {
        const res = await fetch(`${CONFIG.apiUrl}/auth/login`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({password:pass})
        });
        if (!res.ok) return false;
        const data = await res.json();
        authToken = data.token;
        const exp = new Date(); 
        exp.setDate(exp.getDate() + 30);
        authExpiry = exp.toISOString();
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('authExpiry', authExpiry);
        return true;
    } catch { 
        return false; 
    }
}

// Open photo in iOS Photos app
function openInPhotos(imageUrl) {
    // Try to trigger download which opens in Photos
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `photo-${Date.now()}.jpg`;
    a.target = '_blank';
    a.click();
    
    // Also show helpful message
    setTimeout(() => {
        alert('📱 Photo opening...\n\nTip: After viewing, you can save to Photos by tapping the share button.');
    }, 500);
}
