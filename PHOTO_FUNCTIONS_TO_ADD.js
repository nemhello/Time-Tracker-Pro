// ============================================
// PHOTO FEATURES - Add these to your app.js
// ============================================
// Add AFTER your existing utility functions
// Add BEFORE the final closing of the file

// ============================================
// ENHANCED LOCATION FUNCTIONS (Replace existing)
// ============================================

// REPLACE your existing renderLocationList() function with this:
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

// REPLACE your existing showLocationDetails() function with this:
function showLocationDetails(name, chargeCodeSZ, chargeCodeMOS, address, category) {
    selectedLocation = { name, chargeCodeSZ, chargeCodeMOS, address, category };
    currentLocationPhotos = getLocationPhotos(name);
    photoViewMode = false;
    
    // Training goes straight to timer
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
    
    // Update buttons section with photo option
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

// ============================================
// PHOTO GALLERY VIEW
// ============================================

function togglePhotoView() {
    photoViewMode = !photoViewMode;
    
    if (photoViewMode) {
        showPhotoGallery();
    } else {
        renderLocationDetailsView();
    }
}

function showPhotoGallery() {
    if (!authToken) {
        alert('❌ Photo features require authentication.');
        return;
    }
    
    const detailsCard = document.querySelector('#locationDetails .details-card');
    if (!detailsCard) return;
    
    detailsCard.innerHTML = `
        <div class="photo-gallery-header">
            <h2>📸 ${selectedLocation.name}</h2>
            <p>${currentLocationPhotos.length} photo${currentLocationPhotos.length !== 1 ? 's' : ''}</p>
        </div>
        
        <div class="photo-capture-section">
            <button class="btn-primary btn-capture" onclick="capturePhoto()">
                📷 Take Photo
            </button>
            <input type="file" id="photoFileInput" accept="image/*" style="display: none;" onchange="handlePhotoFile(event)">
            <button class="btn-secondary" onclick="document.getElementById('photoFileInput').click()">
                📁 Upload Photo
            </button>
        </div>
        
        <div class="photo-gallery" id="photoGalleryGrid">
            ${renderPhotoGrid()}
        </div>
        
        <div class="details-buttons">
            <button class="btn-secondary" onclick="togglePhotoView()">⏱️ Back to Timer</button>
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

// ============================================
// PHOTO CAPTURE
// ============================================

async function capturePhoto() {
    if (!authToken) {
        alert('❌ Photo features require authentication.');
        return;
    }
    
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
                    <button class="btn-secondary" id="cancelCapture">Cancel</button>
                    <button class="btn-primary" id="captureButton">📷 Capture</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        const preview = overlay.querySelector('.camera-preview');
        preview.appendChild(video);
        
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });
        
        document.getElementById('captureButton').onclick = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            
            stream.getTracks().forEach(track => track.stop());
            document.body.removeChild(overlay);
            
            canvas.toBlob(async (blob) => {
                if (blob) {
                    await uploadPhoto(blob);
                }
            }, 'image/jpeg', 0.9);
        };
        
        document.getElementById('cancelCapture').onclick = () => {
            stream.getTracks().forEach(track => track.stop());
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
    
    await uploadPhoto(file);
    event.target.value = '';
}

// ============================================
// PHOTO UPLOAD
// ============================================

async function uploadPhoto(photoBlob) {
    if (!authToken) {
        alert('❌ Authentication required for photo upload.');
        return;
    }
    
    showLoadingIndicator('Uploading photo...');
    
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
        
        const photoData = {
            id: Date.now().toString(),
            storage: result.storage,
            assetId: result.assetId || result.cloudinaryId,
            url: getProxiedImageUrl(result),
            fullUrl: result.fullUrl || result.url,
            timestamp: result.timestamp || new Date().toISOString(),
            location: selectedLocation.name,
            needsSync: result.needsSync || false
        };
        
        addPhotoToLocation(selectedLocation.name, photoData);
        currentLocationPhotos = getLocationPhotos(selectedLocation.name);
        
        hideLoadingIndicator();
        
        if (photoViewMode) {
            showPhotoGallery();
        }
        
        alert(`✅ Photo uploaded to ${result.storage}!`);
        
    } catch (error) {
        console.error('Upload failed:', error);
        hideLoadingIndicator();
        alert('❌ Photo upload failed.\n\n' + error.message);
    }
}

function getProxiedImageUrl(result) {
    if (result.storage === 'immich' && result.assetId) {
        return `${CONFIG.apiUrl}/api/immich/assets/${result.assetId}/thumbnail`;
    } else {
        return result.url;
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

// ============================================
// PHOTO VIEWER
// ============================================

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
            <img src="${photo.fullUrl || photo.url}" alt="Photo">
            <div class="photo-viewer-footer">
                <div>${selectedLocation.name}</div>
                <div>${new Date(photo.timestamp).toLocaleString()}</div>
                <div>${photo.storage === 'immich' ? '🏠 Immich' : photo.storage === 'cloudinary' ? '☁️ Cloudinary' : '📱 Local'}</div>
            </div>
            <div class="photo-viewer-nav">
                ${index > 0 ? `<button onclick="viewFullPhoto(${index - 1})">← Previous</button>` : '<div></div>'}
                <button class="btn-delete" onclick="deletePhoto(${index})">🗑️ Delete</button>
                ${index < currentLocationPhotos.length - 1 ? `<button onclick="viewFullPhoto(${index + 1})">Next →</button>` : '<div></div>'}
            </div>
        </div>
    `;
    
    document.body.appendChild(viewer);
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
    }
    
    alert('✓ Photo deleted');
}

// ============================================
// ENHANCED EXPORT (Include Photos)
// ============================================

// REPLACE your existing exportData() function with this:
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

// REPLACE your existing importData() function with this:
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

// ============================================
// END OF PHOTO FUNCTIONS
// ============================================
