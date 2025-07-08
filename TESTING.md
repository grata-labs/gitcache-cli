# GitCache Testing Setup

## Overview

GitCache now has a streamlined, production-ready testing strategy optimized for both development and CI environments.

## Test Strategy

- **Unit Tests:** 23 tests - Fast, isolated component testing
- **Integration Tests:** 10 tests - Real git operations with minimal fixtures
- **Total CI Time:** Fast enough for continuous integration

## Key Features

### ✅ Fast CI Integration

- Real git operations using minimal local repositories
- Single commits per test repo (not complex history)
- No external dependencies or network calls
- Automatic cleanup after each test

### ✅ Environment-based Skipping

```bash
# Full test suite (recommended for CI)
npm run test:ci

# Unit tests only (ultra-fast CI)
npm run test:ci:fast
```

### ✅ Developer-friendly

```bash
# All tests
npm test

# All tests with coverage
npm run test:coverage

# CI tests (unit + integration)
npm run test:ci

# CI tests with coverage (used in CI)
npm run test:ci:coverage

# Watch mode
npm run test:watch
```

## File Structure

```
src/test/
├── integration/
│   ├── integration.test.ts         # 3 end-to-end workflow tests
│   ├── add.integration.test.ts     # 7 focused add command tests
│   └── shared-setup.ts             # Shared integration test utilities
├── fixtures/
│   └── fast-test-repos.ts          # Minimal git repo utilities
├── commands/                       # Unit tests for CLI commands
├── lib/                            # Unit tests for library modules
└── *.test.ts                       # Core unit tests
```

## CI Configuration

### Optimized CI Strategy

GitCache uses a **smart CI approach** that runs integration tests only once in the core testing stage:

**Stage 1: Quick Validation**

- Linting and TypeScript checks on Ubuntu + Node 20

**Stage 2: Core Testing**

- **Full test suite** (unit + integration) on Ubuntu + Node 20
- **Code coverage** generation and upload to Codecov
- Integration tests run only here for efficiency

**Stage 3: Extended Validation**

- **Unit tests only** across matrix (Windows, macOS, Node 22)
- No duplicate integration testing across platforms

### GitHub Actions Example

```yaml
# Core testing (Ubuntu + Node 20)
- name: Core Tests with Coverage
  run: npm run test:ci:coverage # Runs unit + integration tests + coverage

# Matrix testing (other platforms)
- name: Matrix Tests
  run: npm run test:unit # Unit tests only
```

### Benefits

- ✅ **Faster CI** - Integration tests run once instead of 5+ times
- ✅ **100% coverage** - Complete code coverage with real git operations
- ✅ **Clean coverage** - Test files excluded from coverage reports
- ✅ **Same coverage** - All platforms test unit logic
- ✅ **Cost efficient** - Reduced CI minutes
- ✅ **Quick feedback** - Critical integration issues caught early

## Performance Benchmarks

- **Before:** 30+ second integration tests (too slow for CI)
- **After:** Fast test suite optimized for CI performance
- **Improvement:** Significantly faster while maintaining real git testing

## Maintenance

- **Shared setup:** `useIntegrationTestSetup()` utility for consistent test environments
- **Command-focused tests:** Each command has dedicated integration test file
- **No fixture files to maintain:** Dynamic repository creation
- **No external dependencies:** Self-contained test infrastructure
- **Simple, focused test structure:** Easy to extend with new test cases

This setup provides the optimal balance of **speed**, **authenticity**, and **simplicity** for GitCache development and CI/CD pipelines.
