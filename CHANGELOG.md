# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased](https://github.com/atomist-skills/npm-skill/compare/1.0.4...HEAD)

### Changed

-   Add .npm to .npmignore during install step. [bff42ec](https://github.com/atomist-skills/npm-build-skill/commit/bff42ecc72ab7a3cf57f99ff2326054492217536)

## [1.0.4](https://github.com/atomist-skills/npm-skill/compare/1.0.3...1.0.4) - 2021-04-01

## [1.0.3](https://github.com/atomist-skills/npm-skill/compare/1.0.2...1.0.3) - 2020-12-07

### Added

-   Add branch and tag filter. [37ab766](https://github.com/atomist-skills/npm-build-skill/commit/37ab7661bf26917596c85d8563b00044213ccca7)

## [1.0.2](https://github.com/atomist-skills/npm-skill/compare/1.0.1...1.0.2) - 2020-11-22

### Fixed

-   Fix check body formatting. [a53f0cf](https://github.com/atomist-skills/npm-build-skill/commit/a53f0cf736a39496e1f6a63b70e770edf2b69651)

## [1.0.1](https://github.com/atomist-skills/npm-skill/compare/1.0.0...1.0.1) - 2020-11-22

### Fixed

-   Leaving "Node.js version" blank. [#80](https://github.com/atomist-skills/npm-build-skill/issues/80)

## [1.0.0](https://github.com/atomist-skills/npm-skill/compare/0.3.3...1.0.0) - 2020-11-16

### Changed

-   Standardize status messages. [#70](https://github.com/atomist-skills/npm-build-skill/issues/70)
-   Update skill icon. [c8ba6cc](https://github.com/atomist-skills/npm-build-skill/commit/c8ba6cc191f5db06e3751f4d5083eefd3ace1694)

### Removed

-   Remove chat integration. [#71](https://github.com/atomist-skills/npm-build-skill/issues/71)

### Fixed

-   Set check to success without publish. [5f26d51](https://github.com/atomist-skills/npm-build-skill/commit/5f26d5120e355f69e1d3cb86861e1133e732d684)

## [0.3.3](https://github.com/atomist-skills/npm-skill/compare/0.3.2...0.3.3) - 2020-11-11

### Changed

-   Add description to npm registry provider. [13091f1](https://github.com/atomist-skills/npm-build-skill/commit/13091f10f301d28ce642791ea775bf46632de1c5)

## [0.3.2](https://github.com/atomist-skills/npm-skill/compare/0.3.1...0.3.2) - 2020-11-10

### Changed

-   Make script & cache advanced parameters. [eb39b7d](https://github.com/atomist-skills/npm-build-skill/commit/eb39b7dddfeaf0eb51c4e4936e4e7eb81852b2b2)
-   Make npm scripts optional. [898591d](https://github.com/atomist-skills/npm-build-skill/commit/898591dd2618ac2e814ed31dd3d6d8a8df7cbf61)

### Fixed

-   Create next distribution tag for prereleases. [dabd1e1](https://github.com/atomist-skills/npm-build-skill/commit/dabd1e16c3b9a7b982fb8f41aeca3d42d82038f3)

## [0.3.1](https://github.com/atomist-skills/npm-skill/compare/0.3.0...0.3.1) - 2020-10-30

### Added

-   Add trigger option with support for tags. [#39](https://github.com/atomist-skills/npm-build-skill/issues/39)

### Fixed

-   Improve handling of onTag configuration. [#53](https://github.com/atomist-skills/npm-build-skill/issues/53)
-   Allow setting same version. [4073096](https://github.com/atomist-skills/npm-build-skill/commit/407309640673fedcf20536da2d5ab4d02cd87d36)
-   Skill fails on sandbox with file not found error. [#61](https://github.com/atomist-skills/npm-build-skill/issues/61)

## [0.3.0](https://github.com/atomist-skills/npm-skill/compare/0.2.1...0.3.0) - 2020-10-16

### Changed

-   Update skill category. [23c227f](https://github.com/atomist-skills/npm-build-skill/commit/23c227f55f79de0235168c5668a528f63b3a5eed)

### Fixed

-   Fix npmrc env variable name. [423a963](https://github.com/atomist-skills/npm-build-skill/commit/423a9630d15716968aec8cb0fa0ee2c39adf9dca)

## [0.2.1](https://github.com/atomist-skills/npm-skill/compare/0.2.0...0.2.1) - 2020-10-14

### Added

-   Use generic npm registry. [#44](https://github.com/atomist-skills/npm-build-skill/issues/44)

## [0.2.0](https://github.com/atomist-skills/npm-skill/compare/0.1.1...0.2.0) - 2020-09-25

### Added

-   Make git and npm tags branch-aware. [#30](https://github.com/atomist-skills/npm-build-skill/issues/30)

## [0.1.1](https://github.com/atomist-skills/npm-skill/compare/0.1.0...0.1.1) - 2020-07-28

## [0.1.0](https://github.com/atomist-skills/npm-skill/tree/0.1.0) - 2020-07-17

### Added

-   Add slack message for publish. [fb7d063](https://github.com/atomist-skills/npm-skill/commit/fb7d06389e908341d6de94e581f4afa12898cc72)
-   Make Git tag a configuration option. [c3b5962](https://github.com/atomist-skills/npm-skill/commit/c3b596202580f519bf305ec63b6884a237c1a225)
-   Add README content. [2f4eea2](https://github.com/atomist-skills/npm-build-skill/commit/2f4eea2d490fdbb7bb519ee4f951c8e60c995797)
