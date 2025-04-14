import { http, HttpResponse, delay } from 'msw';

// Define common handlers for testing
export const handlers = [
  // Successful GET request
  http.get('https://example.com/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'User 1' },
      { id: 2, name: 'User 2' }
    ], { status: 200 });
  }),

  // Successful POST request
  http.post('https://example.com/api/users', async ({ request }) => {
    const data = await request.json() as { name: string };
    return HttpResponse.json({ id: 3, name: data.name }, { status: 201 });
  }),

  // Error response
  http.get('https://example.com/api/error', () => {
    return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
  }),

  // Not found response
  http.get('https://example.com/api/not-found', () => {
    return HttpResponse.json({ error: 'Resource not found' }, { status: 404 });
  }),

  // Timeout simulation
  http.get('https://example.com/api/timeout', async () => {
    await delay(3000);
    return HttpResponse.json({ message: 'Delayed response' }, { status: 200 });
  }),

  // Rate limiting simulation
  http.get('https://example.com/api/rate-limited', () => {
    return HttpResponse.json(
      { error: 'Too many requests' },
      { 
        status: 429,
        headers: {
          'Retry-After': '30'
        }
      }
    );
  })
];

// Handler for testing retry logic
export const createFlakyHandler = (successAfterAttempts = 1) => {
  let requestCount = 0;

  return http.get('https://example.com/api/flaky', () => {
    requestCount++;

    if (requestCount <= successAfterAttempts) {
      return new HttpResponse(null, { status: 0 }); // Network error simulation
    }

    return HttpResponse.json(
      { 
        success: true,
        attempts: requestCount 
      },
      { status: 200 }
    );
  });
};

// Reset the request count for flaky handler tests
export const resetHandlerCounters = () => {
  // This function would reset any counters used in dynamic handlers
  // Currently only used in tests directly
}; 