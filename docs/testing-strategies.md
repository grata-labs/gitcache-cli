# GitCache Testing Strategy

This document outlines the testing approach for GitCache, optimized for both development and CI environments.

## Overview

GitCache uses a **two-tier testing strategy**:

1. **Unit Tests** - Fast, isolated component testing
2. **Integration Tests** - Real git operations with minimal fixtures

## Testing Strategy

### Unit Tests ⚡️

- **Duration:** ~500ms
- **Coverage:** All modules and functions
- **Isolation:** Mocked dependencies
- **Command:** `npm run test:unit`

### Integration Tests 🔧

- **Duration:** ~3.5s
- **Coverage:** End-to-end GitCache operations
- **Real Git:** Minimal git repositories with single commits
- **Command:** `npm run test:integration`

## CI Strategy

For CI environments, we use a **balanced approach** that runs both unit and integration tests:

```bash
npm run test:ci  # Unit tests (0.5s) + Integration tests (3.5s) = 4s total
```

**Benefits:**

- ✅ **4-second total runtime** - Fast enough for CI
- ✅ **Real git operations** - Authentic testing with actual git repositories
- ✅ **Comprehensive coverage** - Tests both isolated components and full workflows
- ✅ **CI-friendly** - No external dependencies or complex setup

### Environment-based Skipping

For ultra-fast CI pipelines (e.g., pre-commit hooks), integration tests can be skipped:

```bash
npm run test:ci:fast  # Unit tests only (~500ms)
```

Integration tests automatically skip when:

- `CI=true` environment variable is set
- `SKIP_INTEGRATION_TESTS=true` environment variable is set

## Implementation Details

### Fast Git Fixtures

Integration tests use the `FastGitTestFixtures` class to create minimal git repositories:

```typescript
// Creates repos with single commits for speed
const fixtures = new FastGitTestFixtures();
const repos = fixtures.createFastRepos();
```

**Key optimizations:**

- Single commit per repository (not complex history)
- Minimal file content (`README.md` with `# Test`)
- Local `file://` URLs (no network operations)
- Automatic cleanup after each test

### Test Structure

```
src/test/
├── commands/           # Unit tests for CLI commands
├── lib/               # Unit tests for library modules
├── integration/       # Integration tests
│   └── integration.test.ts
└── fixtures/          # Test utilities
    └── fast-test-repos.ts
```

### Environment Variables

| Variable                      | Effect                  | Use Case          |
| ----------------------------- | ----------------------- | ----------------- |
| `CI=true`                     | Skips integration tests | CI environments   |
| `SKIP_INTEGRATION_TESTS=true` | Skips integration tests | Local development |

## Running Tests

### Development Workflow

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Watch mode for development
npm run test:watch
```

### CI Workflow

```bash
# Recommended for most CI environments
npm run test:ci

# For ultra-fast CI (unit tests only)
npm run test:ci:fast
```

## Performance Benchmarks

| Test Suite        | Duration | Tests  | Coverage             |
| ----------------- | -------- | ------ | -------------------- |
| Unit Tests        | ~500ms   | 23     | Component logic      |
| Integration Tests | ~3.5s    | 3      | End-to-end workflows |
| **Total CI**      | **~4s**  | **26** | **Complete**         |

## Maintenance

### Adding New Tests

1. **Unit tests:** Add to appropriate `src/test/` subdirectory
2. **Integration tests:** Add to `src/test/integration/integration.test.ts`
3. **Follow patterns:** Use existing test structure and utilities

### Fixture Updates

Fast git fixtures are created dynamically, so no manual maintenance is required. If you need different test scenarios:

1. Modify `FastGitTestFixtures.createMinimalRepository()`
2. Add new repository types to `createFastRepos()`

## Conclusion

This testing strategy provides **comprehensive coverage in under 4 seconds**, making it perfect for both development velocity and CI efficiency. The approach balances:

- ✅ **Speed** - Fast enough for frequent CI runs
- ✅ **Authenticity** - Real git operations provide confidence
- ✅ **Simplicity** - Single integration test file, minimal setup
- ✅ **Reliability** - No external dependencies or complex fixtures
