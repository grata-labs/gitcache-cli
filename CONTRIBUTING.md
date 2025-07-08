# Contributing to GitCache CLI

Thank you for your interest in contributing to GitCache CLI! This document outlines the development process and requirements for contributing to this project.

## Prerequisites

- Node.js >= 20
- npm

## Development Setup

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests to ensure everything is working:
   ```bash
   npm test
   ```

## Development Workflow

### 1. Code Quality Requirements

All contributions must meet these requirements:

- **100% Test Coverage**: All code must have complete test coverage
- **Linting**: Code must pass ESLint checks
- **TypeScript**: All code must be properly typed with no TypeScript errors

### 2. Testing

Run tests during development:
```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

**Coverage Requirement**: All pull requests must maintain 100% test coverage. The CI will fail if coverage drops below 100%.

### 3. Code Style

We use ESLint and Prettier for code formatting:
```bash
# Check for linting issues
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format
```

## Pull Request Guidelines

### 1. PR Title Format

All pull request titles **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>
<type>: <description>
<type>!: <description>         # Breaking change
<type>(<scope>)!: <description> # Breaking change with scope
```

**Allowed types:**
- `feat`: New features
- `fix`: Bug fixes  
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes
- `build`: Build system changes
- `perf`: Performance improvements
- `revert`: Reverting changes

**Examples:**
- `feat(cli): add support for custom cache directories`
- `fix(cache): resolve race condition in concurrent operations`
- `docs: update installation instructions`
- `test(utils): add tests for path resolution`
- `feat: add new caching strategy`
- `fix: resolve memory leak issue`
- `feat!: remove deprecated cache API`
- `fix(auth)!: change authentication method`

**Rules:**
- Maximum 100 characters
- Use lowercase for scope (when provided)
- Scope is optional but recommended for clarity
- Use `!` after type/scope to indicate breaking changes
- Description should be concise and clear

### 2. PR Content Requirements

Before submitting a pull request:

1. **Write Tests**: Add comprehensive tests for new functionality
2. **Update Documentation**: Update README.md or other docs if needed
3. **Test Coverage**: Ensure 100% test coverage is maintained
4. **Code Quality**: Pass all linting and TypeScript checks
5. **Build Success**: Ensure the project builds successfully

### 3. CI Checks

All PRs must pass these automated checks:

- ✅ PR title follows conventional commit format
- ✅ All tests pass
- ✅ 100% test coverage maintained
- ✅ No linting errors
- ✅ No TypeScript errors
- ✅ Successful build

## Development Commands

```bash
# Development
npm run dev              # Run CLI in development mode
npm run build           # Build the project
npm run test            # Run tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage
npm run lint            # Check for linting issues
npm run lint:fix        # Fix linting issues
npm run format          # Format code with Prettier
```

## Release Process

This project uses automated releases via semantic-release. When PRs are merged to main with conventional commit titles, releases are automatically created based on the commit types:

- `feat`: Minor version bump
- `fix`: Patch version bump  
- `feat!` or `fix!`: Major version bump (breaking changes)

## Getting Help

If you have questions or need help:

1. Check existing [issues](https://github.com/grata-labs/gitcache-cli/issues)
2. Create a new issue with your question
3. Join discussions in existing issues

## Code of Conduct

Please be respectful and constructive in all interactions. We aim to maintain a welcoming environment for all contributors.

Thank you for contributing! 🚀
