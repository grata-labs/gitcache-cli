# GitCache CLI

> Universal Git-dependency cache — _CLI for local caching, lockfile analysis, and optimized installs_

![CI](https://github.com/grata-labs/gitcache-cli/actions/workflows/ci.yml/badge.svg)
[![Integration: macOS](https://github.com/grata-labs/gitcache-cli/actions/workflows/integration-macos.yml/badge.svg)](https://github.com/grata-labs/gitcache-cli/actions/workflows/integration-macos.yml)
[![Integration: Windows](https://github.com/grata-labs/gitcache-cli/actions/workflows/integration-windows.yml/badge.svg)](https://github.com/grata-labs/gitcache-cli/actions/workflows/integration-windows.yml)
[![Integration: Ubuntu](https://github.com/grata-labs/gitcache-cli/actions/workflows/integration-ubuntu.yml/badge.svg)](https://github.com/grata-labs/gitcache-cli/actions/workflows/integration-ubuntu.yml)
[![npm version](https://img.shields.io/npm/v/@grata-labs/gitcache-cli.svg)](https://www.npmjs.com/package/@grata-labs/gitcache-cli)

A TypeScript CLI for caching Git repositories locally, analyzing lockfiles, and accelerating npm installs. Team-shared GitCache proxy support is coming soon.

## Installation

```bash
npm install -g @grata-labs/gitcache-cli
```

## Usage

### Cache a Git repository locally

```bash
# Cache a repository to ~/.gitcache/
gitcache cache https://github.com/user/repo.git

# Force overwrite if it already exists
gitcache cache https://github.com/user/repo.git --force
```

### Install npm packages with gitcache

```bash
# Use gitcache as npm cache for faster installs
gitcache install

# Install dev dependencies using the 'i' alias
gitcache i --save-dev typescript @types/node
```

### Get help

```bash
gitcache --help
gitcache cache --help
```

## How it works

GitCache CLI mirrors Git repositories to `~/.gitcache/` using `git clone --mirror`, creating a bare repository for fast local caching. It scans your lockfile for Git dependencies, resolves references, and pre-builds tarballs for optimized npm installs. All install operations use the local cache for maximum speed. Team cache/proxy support is coming soon.

## Roadmap

- ✅ **Local cache** — mirror repos to `~/.gitcache`
- ✅ **Scan, Prepare, Analyze commands** — lockfile-aware CLI for Git dependencies
- ✅ **Install command with lockfile integration** — optimized install using cache
- ⏳ **Team cache** — push mirrors to S3-backed GitCache proxy
- ⏳ **Integrity verification** — signed manifests
- ⏳ **Enhanced npm integration** — advanced npm workflow optimizations

## Development

```bash
# Clone and setup
git clone https://github.com/grata-labs/gitcache-cli.git
cd gitcache-cli
npm install

# Development
npm run dev -- cache https://github.com/user/repo.git
npm run build
npm test
npm run lint
```

## Contributing

PRs & issues welcome! This is an open-source project from [Grata Labs](https://grata-labs.com).

## License

MIT - see [LICENSE](LICENSE) file.
