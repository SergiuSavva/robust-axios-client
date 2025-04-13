# Axios Mocks for Testing

This directory contains tests that use mocked axios responses instead of making real HTTP requests. This approach provides several benefits:

1. **Faster tests**: No actual network requests means tests run much quicker
2. **Deterministic**: Tests are not affected by external services or network conditions
3. **Isolated**: You can test specific edge cases without requiring a server to reproduce them

## How to Use the Mocks

The mocks are implemented using the `AxiosMock` helper class located in `tests/helpers/axios-mock.ts`. This class overrides axios's behavior to return predefined responses.

### Basic Usage

```typescript
import { AxiosMock } from '../helpers/axios-mock';
import RobustAxiosFactory from '../../src';

describe('My Test Suite', () => {
  let axiosMock: AxiosMock;
  
  beforeEach(() => {
    axiosMock = new AxiosMock();
  });
  
  afterEach(() => {
    axiosMock.reset();
    RobustAxiosFactory._resetForTesting();
  });
  
  test('should handle success response', async () => {
    // Mock a successful response
    axiosMock.mockResponse('/api/users', {
      data: [{ id: 1, name: 'User 1' }],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as any
    });
    
    // Create a client
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com'
    });
    
    // Make request
    const response = await client.get('/api/users');
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toHaveLength(1);
  });
  
  test('should handle error response', async () => {
    // Mock an error
    axiosMock.mockError('/api/error', new Error('Network Error'));
    
    // Create a client
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com'
    });
    
    // Make request and expect error
    await expect(client.get('/api/error')).rejects.toThrow('Network Error');
  });
});
```

### Testing Retry Logic

To test retry logic, you can use a pattern where the first call fails but subsequent calls succeed:

```typescript
// Store original mock methods
const originalMockError = axiosMock.mockError;
const originalMockResponse = axiosMock.mockResponse;

// Override the mock method
axiosMock.mockError = (urlPattern, error) => {
  // Set up the initial error
  originalMockError.call(axiosMock, `${urlPattern}__initial`, error);
  
  // Set up success for retry attempts
  originalMockResponse.call(axiosMock, urlPattern, {
    data: { success: true },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as any
  });
};

// Now mock an error that will succeed on retry
axiosMock.mockError('/api/data', new Error('Network Error'));
```

### Available Mock Methods

- `mockResponse(urlPattern, response)`: Mock a successful response for URLs matching the pattern
- `mockError(urlPattern, error)`: Mock an error for URLs matching the pattern
- `reset()`: Reset all mocks and restore original axios behavior
- `getInstanceCount()`: Get the count of axios instances created through the mock

## Test Examples

This directory contains the following example tests:

- `basic.test.ts`: Basic usage of the axios mock
- `retry-logic.test.ts`: Advanced testing of retry logic

Feel free to reference these examples when writing your own mock tests. 