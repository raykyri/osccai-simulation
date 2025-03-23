import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';

const app = express();
const PORT = 3001;
const TARGET_URL = new URL('https://pol.is');

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

// Custom proxy implementation
app.use('/proxy', async (req, res) => {
  try {
    // Remove '/proxy' prefix
    const path = req.url.replace(/^\/proxy/, '') || '/';
    
    const url = new URL(path, TARGET_URL).toString();

    console.log(`Proxying request to: ${url}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    // Get full response data
    const data = await response.text();
    console.log('Data fetched successfully!');
    console.log(`First 200 characters of data: ${data.substring(0, 200)}...`);
    
    res.status(response.status);
    res.send(data);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy Error: ' + error.message);
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});