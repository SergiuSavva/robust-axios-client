// Basic example of using robust-axios-client
import RobustAxios from '../src';
import { AxiosError } from 'axios';

async function main() {
  // Create a client with retry enabled
  const client = RobustAxios.create({
    baseURL: 'https://jsonplaceholder.typicode.com',
    timeout: 5000,
    retry: {
      maxRetries: 3,
      retryDelay: (retryCount) => retryCount * 1000, // 1s, 2s, 3s
      retryCondition: (error) => {
        // Retry on network errors or 5xx server errors
        return !error.response || error.response?.status >= 500;
      }
    }
  });

  try {
    // Make a request
    console.log('Making request to /posts...');
    const response = await client.get('/posts/1');
    console.log('Success!', response.status);
    console.log('Data:', response.data);
    
    // Try an endpoint that doesn't exist (should retry but eventually fail)
    console.log('\nTrying a non-existent endpoint (should fail after retries)...');
    await client.get('/non-existent-endpoint');
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Request failed:', axiosError.message);
    if (axiosError.response) {
      console.log('Status:', axiosError.response.status);
      console.log('Response data:', axiosError.response.data);
    }
  }
}

main().catch(console.error); 