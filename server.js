import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const TARGET_URL = new URL('https://pol.is');

// Simple in-memory cache
const cache = new Map();
const CACHE_DURATION = 30 * 1000; // 30 seconds in milliseconds

// Enable CORS
app.use(cors());

// Simple logger middleware
app.use((req, res, next) => {
  console.log('\n---- INCOMING REQUEST ----');
  console.log(`${req.method} ${req.url}`);
  console.log('Request Headers:');
  console.log(req.headers);
  
  // Capture response headers
  const originalSend = res.send;
  res.send = function(...args) {
    console.log('\n---- OUTGOING RESPONSE ----');
    console.log(`Status: ${res.statusCode}`);
    console.log('Response Headers:');
    console.log(res.getHeaders());
    return originalSend.apply(this, args);
  };
  
  next();
});

// Serve static files from the build directory with cache control
app.use(express.static(path.join(__dirname, 'build'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // For JS, CSS, and HTML files - no cache (must revalidate)
    if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // For other static assets - cache for 1 hour
      res.setHeader('Cache-Control', 'max-age=3600');
    }
  }
}));

// Custom proxy implementation
app.use('/proxy', async (req, res) => {
  try {
    // Remove '/proxy' prefix
    const path = req.url.replace(/^\/proxy/, '') || '/';
    
    const url = new URL(path, TARGET_URL).toString();
    
    console.log(`Proxying request to: ${url}`);

    // Check cache for GET requests
    if (req.method === 'GET') {
      const cacheKey = url;
      const cachedResponse = cache.get(cacheKey);
      
      if (cachedResponse && cachedResponse.expiry > Date.now()) {
        console.log('Serving response from cache');
        res.status(cachedResponse.status);
        return res.send(cachedResponse.data);
      }
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    // Get full response data
    const data = await response.text();
    console.log('Data fetched successfully!');
    console.log(`First 200 characters of data: ${data.substring(0, 200)}...`);
    
    // Cache the response for GET requests
    if (req.method === 'GET') {
      const cacheKey = url;
      cache.set(cacheKey, {
        data,
        status: response.status,
        expiry: Date.now() + CACHE_DURATION
      });
      console.log(`Cached response for ${cacheKey}`);
    }
    
    res.status(response.status);
    res.send(data);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy Error: ' + error.message);
  }
});

// Handle any remaining requests with index.html (SPA routing)
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});