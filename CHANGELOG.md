# [1.9.0](https://github.com/grata-labs/gitcache-cli/compare/v1.8.0...v1.9.0) (2025-08-20)


### Features

* adds endpoint for successful uploads ([52f7911](https://github.com/grata-labs/gitcache-cli/commit/52f79110315d4c70046ecf1f61395a63b070fa05))

# [1.8.0](https://github.com/grata-labs/gitcache-cli/compare/v1.7.0...v1.8.0) (2025-08-10)


### Bug Fixes

* don't require auth if already authed ([cac068c](https://github.com/grata-labs/gitcache-cli/commit/cac068c072bcfe3c65225bf9a6089f389e217e68))
* fixes gitcache not caching without package-lock ([21120ae](https://github.com/grata-labs/gitcache-cli/commit/21120ae0b6fc9664ec6d14f318b429bdeb42e085))
* make downloads work ([a8f9430](https://github.com/grata-labs/gitcache-cli/commit/a8f943001cadc6f2d574ac304d3bca1994625a32))


### Features

* adds list orgs as feature ([ae22d05](https://github.com/grata-labs/gitcache-cli/commit/ae22d054f6a3a488bbf5b847cde22baf61de72f6))
* make uploads work. Fix token expiration ([a5dbeb4](https://github.com/grata-labs/gitcache-cli/commit/a5dbeb40ddee1cd1f364e710809700e74546a74e))

# [1.7.0](https://github.com/grata-labs/gitcache-cli/compare/v1.6.0...v1.7.0) (2025-08-09)


### Bug Fixes

* adds tests for new files, uses real url ([e597c66](https://github.com/grata-labs/gitcache-cli/commit/e597c66edff753b945508adc8004ba1525e6bb7d))
* error messages show friendly messages, not stack trace ([#95](https://github.com/grata-labs/gitcache-cli/issues/95)) ([280d436](https://github.com/grata-labs/gitcache-cli/commit/280d4364babc5afd34847199b2c58dffee703e5b))
* update package lock ([b25d4c6](https://github.com/grata-labs/gitcache-cli/commit/b25d4c6a8243deb48565cddcfdb58e4390a3f2a0))


### Features

* working tokens ([8770bc3](https://github.com/grata-labs/gitcache-cli/commit/8770bc36a476f178fd00c80f908894ae8f1ffa45))

# [1.6.0](https://github.com/grata-labs/gitcache-cli/compare/v1.5.0...v1.6.0) (2025-07-31)


### Features

* ci support ([7adda9c](https://github.com/grata-labs/gitcache-cli/commit/7adda9c1abc8c4ba916beac7d6150f9b94bc4247))

# [1.5.0](https://github.com/grata-labs/gitcache-cli/compare/v1.4.0...v1.5.0) (2025-07-31)


### Features

* simplified cache heirarchy ([d4c5458](https://github.com/grata-labs/gitcache-cli/commit/d4c5458355b7732b305bf61f57f0d555ecadb6b8))

# [1.4.0](https://github.com/grata-labs/gitcache-cli/compare/v1.3.2...v1.4.0) (2025-07-30)


### Bug Fixes

* fix messaging during setup ([0036f50](https://github.com/grata-labs/gitcache-cli/commit/0036f50b45a0820a0107a4c89ef9063b92a7df0b))
* register hides input correctly, doesn't show double message ([524caf4](https://github.com/grata-labs/gitcache-cli/commit/524caf4d2364980a00b9220a45ae8ce19f30b191))


### Features

* adds setup command ([3f851db](https://github.com/grata-labs/gitcache-cli/commit/3f851db6b838cbda3ef948ceffe99ce2bc59f488))
* implement transparent caching with local/registry/git hierarchy ([2d0bfe5](https://github.com/grata-labs/gitcache-cli/commit/2d0bfe5bc41c825b84af56ba001544ea74580e55))

## [1.3.2](https://github.com/grata-labs/gitcache-cli/compare/v1.3.1...v1.3.2) (2025-07-22)


### Bug Fixes

* use spawnSync instead of execSync for cli ([513c4ef](https://github.com/grata-labs/gitcache-cli/commit/513c4ef62c1c11441fd0476d0dd828c3e39a2cb1))

## [1.3.1](https://github.com/grata-labs/gitcache-cli/compare/v1.3.0...v1.3.1) (2025-07-21)


### Bug Fixes

* Fix install command for Windows ([6c544e4](https://github.com/grata-labs/gitcache-cli/commit/6c544e4fcfae49e3c14a03fa8bc38976511c9481))

# [1.3.0](https://github.com/grata-labs/gitcache-cli/compare/v1.2.0...v1.3.0) (2025-07-19)


### Features

* Added prune and config commands ([a865849](https://github.com/grata-labs/gitcache-cli/commit/a8658497daa39ebc5b960f9734bfa58ed09805bf))

# [1.2.0](https://github.com/grata-labs/gitcache-cli/compare/v1.1.0...v1.2.0) (2025-07-18)


### Bug Fixes

* handle windows specific exits from spawn ([66f1261](https://github.com/grata-labs/gitcache-cli/commit/66f12618e462753fb8d1c851185634f4ac65264b))
* tarball builder uses a clean url for clone ([#66](https://github.com/grata-labs/gitcache-cli/issues/66)) ([6cc4248](https://github.com/grata-labs/gitcache-cli/commit/6cc4248a175bc923b1f137c7369e19a527d5417c))


### Features

* add scan and prepare ([2f9ef0d](https://github.com/grata-labs/gitcache-cli/commit/2f9ef0d1e06ea39a5f9e5238443330e421a01b8d))
* added analyze command ([658578b](https://github.com/grata-labs/gitcache-cli/commit/658578b474cf70c032412b0840b0ca17dba6ccb9))
* implements lockfile scanner ([#64](https://github.com/grata-labs/gitcache-cli/issues/64)) ([cf0f7ba](https://github.com/grata-labs/gitcache-cli/commit/cf0f7bafa9623c30bb7b0714430a2e968a5bc487))
* install automatically uses prepare/cache ([02d590b](https://github.com/grata-labs/gitcache-cli/commit/02d590b61e50f8f69ba4184bd59d6e9f1dbef90d))

# [1.1.0](https://github.com/grata-labs/gitcache-cli/compare/v1.0.0...v1.1.0) (2025-07-10)


### Bug Fixes

* adds integration tests, fixes exists/force issue ([07dd1cc](https://github.com/grata-labs/gitcache-cli/commit/07dd1cc9a54a64d4fe82d2e9807d344a47cd3863))
* fix bug of idempotency for add ([01d2fde](https://github.com/grata-labs/gitcache-cli/commit/01d2fde843c11d0b2b3af7baa4e3ad2d7597c6b6))


### Features

* Adds alias system and renames 'cache' to 'add' ([e829e87](https://github.com/grata-labs/gitcache-cli/commit/e829e8707ec60ae51a1a78a3ce37ae205bc6af4c))
* adds update and prune to add --force ([51163e8](https://github.com/grata-labs/gitcache-cli/commit/51163e845141c012efce4e90c7ef20b46633a9d5))
* create's the install command ([aa5f7cc](https://github.com/grata-labs/gitcache-cli/commit/aa5f7ccd950cb96a159cc3f7fe9eb22f3e8f024c))
* implement logging sha ([0f1abb4](https://github.com/grata-labs/gitcache-cli/commit/0f1abb4aad39bd246e56fc2ae087940de74c71d9))
* Implements Tarball Build & Cache ([09cb1bf](https://github.com/grata-labs/gitcache-cli/commit/09cb1bfdfa797b2663998d8daa1581a47b8b7945))
* paths are normalized, protocol chosen is respected ([0be3b73](https://github.com/grata-labs/gitcache-cli/commit/0be3b733c4e04dd4d1ff07bfd6240d5388c13f82))
* replace url encoding with sha-256 ([b7e407d](https://github.com/grata-labs/gitcache-cli/commit/b7e407d702ffd6aa1a68dddf3025651e1eac1d4d))

# 1.0.0 (2025-07-08)


### Bug Fixes

* works with local install ([3ea678b](https://github.com/grata-labs/gitcache-cli/commit/3ea678bd1c5293e1e04f4b28db7249f54bd173f3))


### Features

* code coverage requirements setup ([920b10f](https://github.com/grata-labs/gitcache-cli/commit/920b10fe4d1dba67271bd9551b600a383d33163b))
* first commit, get the cache working ([5ffdb29](https://github.com/grata-labs/gitcache-cli/commit/5ffdb29bb68b16bd100b64e2f0110dc9c63b34e1))
