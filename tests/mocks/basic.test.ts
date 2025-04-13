import { AxiosMock } from '../helpers/axios-mock';
import RobustAxiosFactory from '../../src';
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

interface User {
  id: number;
  name: string;
}

interface Post {
  id: number;
  title: string;
}

interface ErrorResponse {
  error: string;
}

describe('Robust Axios Client with Mocks', () => {
  let axiosMock: AxiosMock;
  
  beforeEach(() => {
    axiosMock = new AxiosMock();
  });
  
  afterEach(() => {
    axiosMock.reset();
    RobustAxiosFactory._resetForTesting();
  });
  
  test('should return mocked response for specific URL', async () => {
    // Mock response for a specific URL
    const mockResponse: AxiosResponse<User> = {
      data: { id: 1, name: 'Test User' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {
        headers: {}
      } as InternalAxiosRequestConfig,
    };
    
    axiosMock.mockResponse('/user', mockResponse);
    
    // Create a client instance
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      timeout: 1000
    });
    
    // Make the request
    const response = await client.get<User>('/user');
    
    // Assert that we got our mocked response
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ id: 1, name: 'Test User' });
  });
  
  test('should handle mocked errors', async () => {
    // Mock an error for a specific URL
    const mockError = new Error('Network Error');
    axiosMock.mockError('/error-endpoint', mockError);
    
    // Create a client instance
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      timeout: 1000
    });
    
    // Make the request and expect it to fail
    await expect(client.get('/error-endpoint')).rejects.toThrow('Network Error');
  });
  
  test('should handle mocked axios error with status code', async () => {
    // Create a mock axios error
    const mockAxiosError: AxiosError<ErrorResponse> = {
      response: {
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Resource not found' },
        headers: {},
        config: {
          headers: {}
        } as InternalAxiosRequestConfig
      },
      isAxiosError: true,
      toJSON: () => ({}),
      name: 'AxiosError',
      message: 'Request failed with status code 404',
      config: {
        headers: {}
      } as InternalAxiosRequestConfig
    };
    
    axiosMock.mockError('/not-found', mockAxiosError);
    
    // Create a client instance
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      timeout: 1000,
      retry: {
        maxRetries: 0 // Disable retries for this test
      }
    });
    
    // Make the request
    try {
      await client.get('/not-found');
      fail('Should have thrown an error');
    } catch (error) {
      const axiosError = error as AxiosError<ErrorResponse>;
      expect(axiosError.response?.status).toBe(404);
      expect(axiosError.response?.data).toEqual({ error: 'Resource not found' });
    }
  });
  
  test('should work with multiple URL patterns', async () => {
    // Mock multiple responses
    axiosMock.mockResponse('/users', {
      data: [{ id: 1, name: 'User 1' }, { id: 2, name: 'User 2' }] as User[],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {
        headers: {}
      } as InternalAxiosRequestConfig
    });
    
    axiosMock.mockResponse('/posts', {
      data: [{ id: 1, title: 'Post 1' }] as Post[],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {
        headers: {}
      } as InternalAxiosRequestConfig
    });
    
    // Create a client instance
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com'
    });
    
    // Make requests to both endpoints
    const usersResponse = await client.get<User[]>('/users');
    const postsResponse = await client.get<Post[]>('/posts');
    
    // Assert the responses
    expect(usersResponse.data).toHaveLength(2);
    expect(usersResponse.data[0]?.name).toBe('User 1');
    
    expect(postsResponse.data).toHaveLength(1);
    expect(postsResponse.data[0]?.title).toBe('Post 1');
  });
}); 