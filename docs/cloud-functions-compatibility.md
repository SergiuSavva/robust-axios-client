# Cloud Functions Compatibility Guide

This guide explains how to use `robust-axios-client` in Google Cloud Functions and other CommonJS environments.

## Installation

```bash
npm install robust-axios-client
```

## CommonJS Usage (Recommended for Cloud Functions)

### Option 1: Using require() with destructuring

```javascript
const { RobustAxiosClient } = require('robust-axios-client');

// Create a client instance
const client = new RobustAxiosClient({
  baseURL: 'https://api.example.com'
});

// Use the client
exports.myCloudFunction = async (req, res) => {
  try {
    const response = await client.get('/users');
    res.json(response.data);
  } catch (error) {
    console.error('Request failed:', error);
    res.status(500).json({ error: 'Request failed' });
  }
};
```

### Option 2: Using the default factory

```javascript
const RobustAxios = require('robust-axios-client').default;

// Create a client instance
const client = RobustAxios.create({
  baseURL: 'https://api.example.com'
});

// Use static methods
exports.myCloudFunction = async (req, res) => {
  try {
    const response = await RobustAxios.get('https://api.example.com/users');
    res.json(response.data);
  } catch (error) {
    console.error('Request failed:', error);
    res.status(500).json({ error: 'Request failed' });
  }
};
```

### Option 3: Using require() with default export

```javascript
const RobustAxios = require('robust-axios-client');

// If the above doesn't work, try:
// const RobustAxios = require('robust-axios-client').default;

const client = RobustAxios.create({
  baseURL: 'https://api.example.com'
});
```

## TypeScript in Cloud Functions

If you're using TypeScript in Cloud Functions:

```typescript
import RobustAxios, { RobustAxiosClient } from 'robust-axios-client';

// Create a client instance
const client = RobustAxios.create({
  baseURL: 'https://api.example.com'
});

export const myCloudFunction = async (req: any, res: any) => {
  try {
    const response = await client.get('/users');
    res.json(response.data);
  } catch (error) {
    console.error('Request failed:', error);
    res.status(500).json({ error: 'Request failed' });
  }
};
```

## Complete Cloud Function Example

```javascript
const { RobustAxiosClient } = require('robust-axios-client');

// Create a configured client
const apiClient = new RobustAxiosClient({
  baseURL: 'https://jsonplaceholder.typicode.com',
  timeout: 5000,
  retry: {
    maxRetries: 3,
    backoffStrategy: 'exponential'
  },
  debug: process.env.NODE_ENV === 'development'
});

/**
 * HTTP Cloud Function that fetches user data
 */
exports.getUser = async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  try {
    const userId = req.query.id || '1';
    
    // Make the API request with retry logic
    const response = await apiClient.get(`/users/${userId}`);
    
    // Return the user data
    res.json({
      success: true,
      data: response.data
    });
    
  } catch (error) {
    console.error('Failed to fetch user:', error.message);
    
    // Return appropriate error response
    const status = error.response?.status || 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Pub/Sub Cloud Function that processes events
 */
exports.processEvent = async (message, context) => {
  try {
    const eventData = message.data 
      ? JSON.parse(Buffer.from(message.data, 'base64').toString())
      : {};

    console.log('Processing event:', eventData);

    // Make API call with the event data
    const response = await apiClient.post('/posts', {
      title: eventData.title,
      body: eventData.body,
      userId: eventData.userId || 1
    });

    console.log('Event processed successfully:', response.data);
    
  } catch (error) {
    console.error('Failed to process event:', error.message);
    
    // Re-throw to trigger Cloud Function retry
    throw error;
  }
};
```

## Troubleshooting

### "Cannot read property 'create' of undefined"

This usually happens when there's an issue with module resolution. Try:

```javascript
// Instead of:
const RobustAxios = require('robust-axios-client');

// Try:
const RobustAxios = require('robust-axios-client').default;

// Or:
const { default: RobustAxios } = require('robust-axios-client');
```

### ESM Import Errors in CommonJS

If you see errors about ES modules, ensure you're using CommonJS syntax:

```javascript
// ❌ Don't use ES6 imports in CommonJS
import RobustAxios from 'robust-axios-client';

// ✅ Use CommonJS require
const RobustAxios = require('robust-axios-client').default;
```

### Module Resolution Issues

If you encounter module resolution issues, you can explicitly require the CommonJS version:

```javascript
const RobustAxios = require('robust-axios-client/dist/cjs');
```

## Environment Configuration

For Cloud Functions, you can set environment variables to configure the client:

```javascript
const client = new RobustAxiosClient({
  baseURL: process.env.API_BASE_URL,
  timeout: parseInt(process.env.API_TIMEOUT) || 5000,
  debug: process.env.NODE_ENV === 'development',
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3
  }
});
```

## Performance Considerations

1. **Reuse client instances**: Create the client outside of the function handler to reuse across invocations
2. **Configure timeouts**: Set appropriate timeouts for Cloud Functions' execution limits
3. **Use circuit breaker**: Enable circuit breaker for external API dependencies
4. **Enable logging**: Use debug mode during development, disable in production

## Security Best Practices

1. Store API keys in Cloud Secret Manager
2. Use service accounts for authentication
3. Configure CORS appropriately
4. Validate input data before making API calls
5. Sanitize sensitive data in logs (enabled by default) 