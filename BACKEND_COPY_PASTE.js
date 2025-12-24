// ========================================
// COPY-PASTE BACKEND FIXES
// File: /mnt/user/appdata/field-auth-backend/app/server.js
// ========================================

// FIX #1: IMAGE PROXY ENDPOINT
// Find around line 370, REPLACE the entire function:

app.get('/api/immich/proxy/:assetId', async (req, res) => {
    try {
        const { assetId } = req.params;
        const useOriginal = req.query.original === 'true';
        
        // Use full-res if ?original=true, otherwise thumbnail
        const endpoint = useOriginal 
            ? `${CONFIG.immich.url}/api/assets/${assetId}/original`
            : `${CONFIG.immich.url}/api/assets/${assetId}/thumbnail`;
        
        console.log(`Proxying ${useOriginal ? 'ORIGINAL' : 'thumbnail'} for ${assetId}`);
        
        const response = await axios.get(endpoint, {
            headers: { 
                'x-api-key': CONFIG.immich.apiKey 
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });
        
        res.set({
            'Content-Type': response.headers['content-type'],
            'Content-Length': response.headers['content-length'],
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
        });
        
        res.send(response.data);
    } catch (error) {
        console.error('Image proxy error:', error.message);
        res.status(500).json({ error: 'Failed to proxy image' });
    }
});

// ========================================

// FIX #2: UPLOAD RESPONSE
// Find around line 333, in the Immich upload success block:

// BEFORE:
url: `${CONFIG.apiUrl}/api/immich/proxy/${data.id}`,
fullUrl: `${CONFIG.apiUrl}/api/immich/proxy/${data.id}`,

// AFTER:
url: `${CONFIG.apiUrl}/api/immich/proxy/${data.id}`,
fullUrl: `${CONFIG.apiUrl}/api/immich/proxy/${data.id}?original=true`,

// ========================================

// DEPLOYMENT:

// 1. Edit file:
//    nano /mnt/user/appdata/field-auth-backend/app/server.js

// 2. Make both changes above

// 3. Save: Ctrl+X, Y, Enter

// 4. Restart:
//    cd /mnt/user/appdata/field-auth-backend
//    docker-compose down && docker-compose up -d

// 5. Test:
//    curl http://localhost:3001/health
//    Should return: {"status":"ok"}

// ========================================

// VERIFICATION:

// After restart, check logs:
docker logs field-auth-backend --tail 50

// Should see:
// - "Server running on port 3001"
// - "Immich connected successfully"
// - No errors

// Test endpoints:
// Thumbnail: curl -I http://localhost:3001/api/immich/proxy/ASSET_ID
// Full-res:  curl -I http://localhost:3001/api/immich/proxy/ASSET_ID?original=true

// Both should return 200 OK (after you have an asset ID from uploading)
