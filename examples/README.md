# Robust Axios Client Examples

This directory contains examples demonstrating various features of the `robust-axios-client` library.

## Prerequisites

Before running these examples, make sure you have:

1. Installed dependencies:
   ```
   npm install
   ```

2. Built the library:
   ```
   npm run build
   ```

## Available Examples

### 1. Basic Usage (`basic-usage.ts`)

Demonstrates the core functionality of the library with retry capabilities.

**Features demonstrated:**
- Creating a client with custom configuration
- Setting up retry logic with custom retry conditions
- Handling successful and failed requests

### 2. Rate Limiting (`rate-limit-example.ts`)

Shows how to use the built-in rate limiting functionality to control request frequency.

**Features demonstrated:**
- Creating a client with rate limiting
- Sending multiple concurrent requests
- Automatic rate limiting (2 requests per second)

### 3. Circuit Breaker (`circuit-breaker-example.ts`)

Demonstrates the circuit breaker pattern implementation to prevent cascading failures.

**Features demonstrated:**
- Circuit breaker configuration
- State transitions (CLOSED → OPEN → HALF-OPEN → CLOSED)
- Automatic service isolation on repeated failures
- Recovery after timeout period

### 4. Simple Demo (`demo.js`)

A vanilla JavaScript example using the built CommonJS version of the library.

**Features demonstrated:**
- Basic client setup and usage
- Error handling
- Import from the built package

## Running the Examples

### Using NPM Scripts (Recommended)

The package.json includes convenient scripts for running examples:

```bash
# Run the JavaScript demo (simplest way to check if library works)
npm run example:demo

# Run TypeScript examples
npm run example:basic
npm run example:rate-limit
npm run example:circuit-breaker

# Build the library and run the demo in one step
npm run examples
```

### Manual Execution

#### JavaScript Examples (CommonJS)

Run directly with Node.js:

```
node examples/demo.js
```

#### TypeScript Examples

Option 1: Using `tsx` (recommended for simplicity):

```
# Install tsx if not already installed
npm install -D tsx

# Run examples
npx tsx examples/basic-usage.ts
npx tsx examples/rate-limit-example.ts
npx tsx examples/circuit-breaker-example.ts
```

Option 2: Using `ts-node` with ESM support:

```
npx ts-node --esm examples/basic-usage.ts
```

## Expected Output

When running the examples successfully, you should see console output demonstrating the specific feature of each example. The examples are designed to show both successful operation and error handling.

All examples use the JSONPlaceholder API (https://jsonplaceholder.typicode.com) for demonstration purposes. 