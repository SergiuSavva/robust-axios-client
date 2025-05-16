import { setupServer } from 'msw/node';
import { handlers } from './handlers/handlers';
import { LoggerInterface } from '../../src/types';

// Create a mock logger
const mockLogger: LoggerInterface = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Export the mock logger
export { mockLogger };

// Mock the ConsoleLogger class
jest.mock('../../src/utils/logger', () => ({
  ConsoleLogger: jest.fn().mockImplementation(() => mockLogger)
}));

// This configures a request mocking server with the given request handlers.
export const server = setupServer(...handlers);

// Establish API mocking before all tests.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => {
  server.resetHandlers();
  
  // Clear all mocks after each test
  jest.clearAllMocks();
});

// Clean up after the tests are finished.
afterAll(() => {
  server.close();
}); 