# GitCache CLI

> Universal Git-dependency cache & proxy — _CLI client_

![CI](https://github.com/grata-labs/gitcache-cli/actions/workflows/ci.yml/badge.svg)
![Integration: macOS](https://img.shields.io/github/actions/workflow/status/grata-labs/gitcache-cli/weekly-integration.yml?job=integration-macos-status&label=Integration%3A%20macOS)
![Integration: Windows](https://img.shields.io/github/actions/workflow/status/grata-labs/gitcache-cli/weekly-integration.yml?job=integration-windows-status&label=Integration%3A%20Windows)
[![npm version](https://badge.fury.io/js/@grata-labs%2Fgitcache-cli.svg)](https://badge.fury.io/js/@grata-labs%2Fgitcache-cli)

A TypeScript CLI for caching Git repositories locally and (coming soon) syncing with team-shared GitCache proxies.

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

GitCache CLI mirrors Git repositories to `~/.gitcache/` using `git clone --mirror`. This creates a bare repository that can be used as a local cache for faster subsequent clones and fetches.

## Roadmap

- ✅ **Local cache** — mirror repos to `~/.gitcache`
- ⏳ **Team cache** — push mirrors to S3-backed GitCache proxy
- ⏳ **Integrity verification** — signed manifests
- ⏳ **Build-tool plugins** — npm, pip, go mod, cargo

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
