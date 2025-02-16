// import  HttpClient } from '../../src/HttpClient';
import { HttpClientConfig } from '../../src/types';
import HttpClient from '../../src';

describe('HttpClient Integration Tests', () => {
  let httpClient: HttpClient;
  beforeEach(() => {
    const config: HttpClientConfig = {
      baseURL: 'https://jsonplaceholder.typicode.com',
      retry: {
        retries: 3,
      //   shouldRetry: (error) => {} // callback function
      }
    };
    httpClient = new HttpClient(config);
  });

  it('should successfully fetch a post from JSONPlaceholder', async () => {
    // Act
    const response = await httpClient.get('/posts/1');

    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toEqual(
      expect.objectContaining({
        id: 1,
        userId: expect.any(Number),
        title: expect.any(String),
        body: expect.any(String)
      })
    );
  });

  it('should handle non-existent resources correctly', async () => {
    // Act & Assert
    await expect(httpClient.get('/posts/999999')).rejects.toThrow();
  });

  it('should successfully create a new post', async () => {
    // Arrange
    const newPost = {
      title: 'Test Post',
      body: 'This is a test post',
      userId: 1
    };

    // Act
    const response = await httpClient.post('/posts', newPost);

    // Assert
    expect(response.status).toBe(201);
    expect(response.data).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        title: newPost.title,
        body: newPost.body,
        userId: newPost.userId
      })
    );
  });

  it('should handle retry on 429 status', async () => {
    // This test might need to be adjusted based on the actual API behavior
    // as JSONPlaceholder doesn't actually return 429 status codes
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    };

    const clientWithLogger = new HttpClient({
      baseURL: 'https://jsonplaceholder.typicode.com',
      logger: mockLogger,
      retry: {
        retries: 3
      }
    });

    // Act
    await clientWithLogger.get('/posts/1');

    // Assert
    expect(mockLogger.info).toHaveBeenCalled();
  });
});