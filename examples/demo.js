// Demo script using the built library
const RobustAxios = require('../dist/cjs/index').default;

// Create client with retry
const client = RobustAxios.create({
  baseURL: 'https://jsonplaceholder.typicode.com',
  timeout: 3000,
  retry: {
    maxRetries: 2,
    retryDelay: (count) => count * 500
  }
});

async function runDemo() {
  try {
    console.log('Making request to a valid endpoint...');
    const response = await client.get('/posts/1');
    console.log('✅ Success:', response.status);
    console.log('Data:', response.data);
    
    console.log('\nTrying to cause a failure (to demonstrate retry logic)...');
    try {
      // This should fail and retry
      await client.get('/non-existent');
    } catch (error) {
      console.log('❌ Expected error after retries:', error.message);
    }
    
    console.log('\nLibrary is working! 🎉');
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

runDemo(); 