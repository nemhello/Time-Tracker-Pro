const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const FormData = require('form-data');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration from environment variables
const CONFIG = {
    jwtSecret: process.env.JWT_SECRET,
    appPassword: process.env.APP_PASSWORD,
    tokenExpiry: process.env.TOKEN_EXPIRY || '30d',
    apiUrl: process.env.API_URL || 'https://field-api.wilkerson-labs.com',
    immich: {
        url: process.env.IMMICH_URL,
        apiKey: process.env.IMMICH_API_KEY
    },
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
        uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'ml_default'
    }
};

// Validate required environment variables
const requiredVars = ['JWT_SECRET', 'APP_PASSWORD', 'IMMICH_URL', 'IMMICH_API_KEY'];
requiredVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`ERROR: Missing required environment variable: ${varName}`);
        process.exit(1);
    }
});

// Middleware
app.use(cors({
    origin: [
        'https://nemhello.github.io',
        'http://localhost:3000',
        'http://localhost:8080',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Rate limiting for login endpoint (prevent brute force)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// General API rate limiting
const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: parseInt(process.env.MAX_REQUESTS_PER_HOUR) || 1000,
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// ============================================
// MIDDLEWARE: JWT Validation
// ============================================

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, CONFIG.jwtSecret, (err, user) => {
        if (err) {
            console.log('Token validation failed:', err.message);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        next();
    });
}

// ============================================
// ROUTES: Authentication
// ============================================

// Health check (no auth required)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Login endpoint
app.post('/auth/login', loginLimiter, (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }

    if (password !== CONFIG.appPassword) {
        console.log('Failed login attempt from IP:', req.ip);
        return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign(
        { 
            type: 'field-assistant',
            iat: Math.floor(Date.now() / 1000)
        },
        CONFIG.jwtSecret,
        { expiresIn: CONFIG.tokenExpiry }
    );

    console.log('Successful login from IP:', req.ip);

    res.json({ 
        token,
        expiresIn: CONFIG.tokenExpiry,
        message: 'Authentication successful'
    });
});

// Validate token endpoint
app.post('/auth/validate', authenticateToken, (req, res) => {
    res.json({ 
        valid: true,
        user: req.user 
    });
});

// ============================================
// ROUTES: Immich Proxy
// ============================================

// Immich ping (with auth)
app.get('/api/immich/ping', authenticateToken, apiLimiter, async (req, res) => {
    try {
        const response = await fetch(`${CONFIG.immich.url}/api/server/ping`, {
            headers: {
                'x-api-key': CONFIG.immich.apiKey,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Immich ping error:', error);
        res.status(500).json({ error: 'Failed to connect to Immich' });
    }
});

// Immich upload (photo upload)
app.post('/api/immich/upload', authenticateToken, apiLimiter, upload.single('assetData'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const formData = new FormData();
        formData.append('assetData', req.file.buffer, {
            filename: req.body.filename || `photo-${Date.now()}.jpg`,
            contentType: req.file.mimetype
        });
        
        formData.append('deviceAssetId', req.body.deviceAssetId || `site-inspector-${Date.now()}`);
        formData.append('deviceId', req.body.deviceId || 'site-inspector-pwa');
        formData.append('fileCreatedAt', req.body.fileCreatedAt || new Date().toISOString());
        formData.append('fileModifiedAt', req.body.fileModifiedAt || new Date().toISOString());

        const response = await fetch(`${CONFIG.immich.url}/api/assets`, {
            method: 'POST',
            headers: {
                'x-api-key': CONFIG.immich.apiKey,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Immich upload failed:', response.status, errorText);
            throw new Error(`Immich upload failed: ${response.status}`);
        }

        const data = await response.json();
        
        console.log('Photo uploaded to Immich:', data.id);
        
        res.json({
            storage: 'immich',
            assetId: data.id,
            url: `${CONFIG.immich.url}/api/assets/${data.id}/thumbnail`,
            fullUrl: `${CONFIG.immich.url}/api/assets/${data.id}/original`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Immich upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Immich image proxy (for displaying images)
app.get('/api/immich/assets/:assetId/:type', authenticateToken, async (req, res) => {
    try {
        const { assetId, type } = req.params; // type = 'thumbnail' or 'original'
        
        const response = await fetch(`${CONFIG.immich.url}/api/assets/${assetId}/${type}`, {
            headers: {
                'x-api-key': CONFIG.immich.apiKey
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Image not found' });
        }

        // Proxy the image
        res.setHeader('Content-Type', response.headers.get('content-type'));
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        const buffer = await response.buffer();
        res.send(buffer);

    } catch (error) {
        console.error('Image proxy error:', error);
        res.status(500).json({ error: 'Failed to load image' });
    }
});

// ============================================
// ROUTES: Cloudinary Proxy
// ============================================

// Cloudinary upload
app.post('/api/cloudinary/upload', authenticateToken, apiLimiter, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.body.filename || `photo-${Date.now()}.jpg`,
            contentType: req.file.mimetype
        });
        formData.append('upload_preset', CONFIG.cloudinary.uploadPreset);
        formData.append('folder', 'site-inspector');
        formData.append('tags', 'site-inspector,field-documentation');

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Cloudinary upload failed:', response.status, errorText);
            throw new Error(`Cloudinary upload failed: ${response.status}`);
        }

        const data = await response.json();
        
        console.log('Photo uploaded to Cloudinary:', data.public_id);

        res.json({
            storage: 'cloudinary',
            cloudinaryId: data.public_id,
            url: data.secure_url,
            thumbnail: data.secure_url.replace('/upload/', '/upload/w_400,h_400,c_fill/'),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cloudinary upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROUTES: Hybrid Upload (Try Immich, fallback to Cloudinary)
// ============================================

app.post('/api/upload', authenticateToken, apiLimiter, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('Attempting upload to Immich first...');
        
        // Try Immich first
        try {
            const formData = new FormData();
            formData.append('assetData', req.file.buffer, {
                filename: `photo-${Date.now()}.jpg`,
                contentType: req.file.mimetype
            });
            formData.append('deviceAssetId', `site-inspector-${Date.now()}`);
            formData.append('deviceId', 'site-inspector-pwa');
            formData.append('fileCreatedAt', new Date().toISOString());
            formData.append('fileModifiedAt', new Date().toISOString());

            const immichResponse = await fetch(`${CONFIG.immich.url}/api/assets`, {
                method: 'POST',
                headers: {
                    'x-api-key': CONFIG.immich.apiKey,
                    ...formData.getHeaders()
                },
                body: formData
            });

            if (immichResponse.ok) {
                const data = await immichResponse.json();
                console.log('✅ Photo uploaded to Immich:', data.id);
                
                // FIXED: Return both thumbnail and full-resolution URLs
                return res.json({
                    storage: 'immich',
                    assetId: data.id,
                    url: `${CONFIG.apiUrl}/api/immich/proxy/${data.id}`,  // Thumbnail for gallery
                    fullUrl: `${CONFIG.apiUrl}/api/immich/proxy/${data.id}?original=true`,  // Full-res for viewer
                    timestamp: new Date().toISOString(),
                    needsSync: false
                });
            }
            
            console.log('⚠️  Immich unavailable, trying Cloudinary...');
            
        } catch (immichError) {
            console.log('⚠️  Immich failed, trying Cloudinary...', immichError.message);
        }

        // Fallback to Cloudinary
        const cloudinaryFormData = new FormData();
        cloudinaryFormData.append('file', req.file.buffer, {
            filename: `photo-${Date.now()}.jpg`,
            contentType: req.file.mimetype
        });
        cloudinaryFormData.append('upload_preset', CONFIG.cloudinary.uploadPreset);
        cloudinaryFormData.append('folder', 'site-inspector');

        const cloudinaryResponse = await fetch(
            `https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/image/upload`,
            {
                method: 'POST',
                body: cloudinaryFormData
            }
        );

        if (!cloudinaryResponse.ok) {
            throw new Error('Both Immich and Cloudinary failed');
        }

        const cloudinaryData = await cloudinaryResponse.json();
        console.log('✅ Photo uploaded to Cloudinary (backup):', cloudinaryData.public_id);

        res.json({
            storage: 'cloudinary',
            cloudinaryId: cloudinaryData.public_id,
            url: cloudinaryData.secure_url,
            thumbnail: cloudinaryData.secure_url.replace('/upload/', '/upload/w_400,h_400,c_fill/'),
            timestamp: new Date().toISOString(),
            needsSync: true  // Will sync to Immich later
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed to all services' });
    }
});

// ============================================
// IMAGE PROXY ENDPOINT (FIXED FOR HIGH-RES)
// ============================================
// Serves Immich images with authentication (NO AUTH REQUIRED for images)
app.get('/api/immich/proxy/:assetId', async (req, res) => {
    try {
        const { assetId } = req.params;
        const useOriginal = req.query.original === 'true';
        
        // Choose endpoint based on query parameter
        const endpoint = useOriginal ? 'original' : 'thumbnail';
        
        console.log(`[IMAGE PROXY] Fetching ${endpoint} for asset: ${assetId}`);
        
        // Fetch from internal Immich server
        const immichUrl = `http://192.168.0.134:8080/api/assets/${assetId}/${endpoint}`;
        
        const response = await fetch(immichUrl, {
            headers: {
                'x-api-key': process.env.IMMICH_API_KEY || 'h8t6TNFpxrIgsQj5r8DWbSDgWEPkVFDJ7gCBbOC7KyA'
            }
        });
        
        if (!response.ok) {
            console.error(`[IMAGE PROXY] Immich returned ${response.status}`);
            throw new Error(`Immich returned ${response.status}`);
        }
        
        // Forward image to client
        const imageBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        res.set('Access-Control-Allow-Origin', 'https://nemhello.github.io');
        res.send(Buffer.from(imageBuffer));
        
        console.log(`[IMAGE PROXY] ✓ Served ${endpoint} for ${assetId}`);
        
    } catch (error) {
        console.error('[IMAGE PROXY] Error:', error);
        res.status(500).json({ error: 'Image proxy failed' });
    }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🔒 Field Assistant Auth Backend v4.0.1');
    console.log('='.repeat(50));
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ API URL: ${CONFIG.apiUrl}`);
    console.log(`✅ Immich URL: ${CONFIG.immich.url}`);
    console.log(`✅ Cloudinary: ${CONFIG.cloudinary.cloudName}`);
    console.log(`✅ JWT expiry: ${CONFIG.tokenExpiry}`);
    console.log(`📸 Photo quality: Thumbnail + Full-res support`);
    console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    process.exit(0);
});
