// Example showing rate limiting functionality
import RobustAxios from '../src';

async function main() {
  // Create client with rate limiting
  const client = RobustAxios.create({
    baseURL: 'https://jsonplaceholder.typicode.com',
    rateLimit: {
      maxRequests: 2,
      windowMs: 1000 // 1 second
    }
  });

  console.log('Making 5 concurrent requests (only 2 per second should execute)...');
  
  // Make multiple concurrent requests
  const promises = Array(5).fill(0).map((_, index) => {
    return client.get(`/posts/${index + 1}`)
      .then(response => {
        console.log(`Request ${index + 1} completed with status ${response.status}`);
        return response;
      })
      .catch(error => {
        console.error(`Request ${index + 1} failed:`, error?.message);
        throw error;
      });
  });

  // Wait for all requests to complete
  await Promise.all(promises);
  console.log('All requests completed!');
}

main().catch(console.error); 