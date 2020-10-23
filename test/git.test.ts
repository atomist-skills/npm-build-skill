/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from "power-assert";
import { cleanGitRef, gitRefToNpmTag, nextPrereleaseTag } from "../lib/git";

describe("git", () => {
	describe("cleanGitRef", () => {
		it("does nothing to clean ref", () => {
			[
				"",
				"main",
				"nothing",
				"gh-pages",
				"clean-branch-name",
				"v1.2.3",
				"3.2.1-main.0",
			].forEach(b => {
				const c = cleanGitRef(b);
				assert(c === b);
			});
		});

		it("cleans ref", () => {
			[
				{ r: "mainly@main", e: "mainlymain" },
				{ r: "mainly_@_main", e: "mainly--main" },
				{ r: "main/ly_@_main", e: "main-ly--main" },
				{ r: "v1.2.3-main.@.0", e: "v1.2.3-main.0" },
				{ r: "v1.2.3-main~vine.0", e: "v1.2.3-mainvine.0" },
			].forEach(re => {
				const c = cleanGitRef(re.r);
				assert(c === re.e);
			});
		});
	});

	describe("gitRefToNpmTag", () => {
		it("prepends branch to clean ref", () => {
			["main", "nothing", "gh-pages", "clean-branch-name"].forEach(b => {
				const c = gitRefToNpmTag(b);
				const e = `branch-${b}`;
				assert(c === e);
			});
		});

		it("prepends provided prefix to clean ref", () => {
			["main", "nothing", "gh-pages", "clean-branch-name"].forEach(b => {
				const c = gitRefToNpmTag(b, "ref");
				const e = `ref-${b}`;
				assert(c === e);
			});
		});

		it("cleans and prepends branch", () => {
			[
				{ b: "mainly@main", e: "branch-mainlymain" },
				{ b: "mainly_@_main", e: "branch-mainly--main" },
				{ b: "main/ly_@_main", e: "branch-main-ly--main" },
			].forEach(be => {
				const c = gitRefToNpmTag(be.b);
				assert(c === be.e);
			});
		});
	});

	describe("nextPrereleaseTag", () => {
		it("returns first prerelease when no tags", () => {
			const n = nextPrereleaseTag({
				branch: "main",
				defaultBranch: "main",
				nextReleaseVersion: "0.1.0",
				tags: [],
			});
			const e = "0.1.0-main.0";
			assert(n === e);
		});

		it("returns first prerelease when no matching tags", () => {
			const n = nextPrereleaseTag({
				branch: "main",
				defaultBranch: "main",
				nextReleaseVersion: "2.4.6",
				tags: [
					"0.1.0-main.0",
					"0.1.0",
					"1.0.0-main.0",
					"1.0.0-branch-feature.0",
					"1.0.0",
					"1.0.1-main.0",
					"1.0.1",
					"2.0.0-main.0",
					"2.0.0",
					"2.0.1-main.0",
					"2.1.0-main.0",
					"2.1.0",
					"2.3.0-main.0",
					"2.4.0",
					"2.4.1-main.0",
					"2.4.1",
				],
			});
			const e = "2.4.6-main.0";
			assert(n === e);
		});

		it("increments existing prerelease", () => {
			const n = nextPrereleaseTag({
				branch: "main",
				defaultBranch: "main",
				nextReleaseVersion: "2.1.1",
				tags: [
					"0.1.0-main.0",
					"0.1.0",
					"1.0.0-main.0",
					"1.0.0-branch-feature.0",
					"1.0.0",
					"1.0.1-main.0",
					"1.0.1",
					"2.0.0-main.0",
					"2.0.0",
					"2.0.1-main.0",
					"2.1.0-main.0",
					"2.1.0",
					"2.1.1-main.0",
					"2.1.1-1",
					"2.1.1-branch-feature.0",
					"2.1.1-branch-feature.1",
					"2.1.1-branch-feature.2",
					"2.1.1-branch-feature.3",
					"2.1.1-main.2",
				],
			});
			const e = "2.1.1-main.3";
			assert(n === e);
		});

		it("returns first branch prerelease", () => {
			const n = nextPrereleaseTag({
				branch: "big/changes_in-store@s",
				defaultBranch: "main",
				nextReleaseVersion: "2.1.1",
				tags: [
					"0.1.0-main.0",
					"0.1.0",
					"1.0.0-main.0",
					"1.0.0-branch-feature.0",
					"1.0.0",
					"1.0.1-main.0",
					"1.0.1",
					"2.0.0-main.0",
					"2.0.0",
					"2.0.1-main.0",
					"2.1.0-main.0",
					"2.1.0",
					"2.1.1-main.0",
					"2.1.1-1",
					"2.1.1-branch-feature.0",
					"2.1.1-branch-feature.1",
					"2.1.1-branch-feature.2",
					"2.1.1-branch-feature.3",
					"2.1.1-main.2",
				],
			});
			const e = "2.1.1-branch-big-changes-in-stores.0";
			assert(n === e);
		});

		it("increments existing branch prerelease", () => {
			const n = nextPrereleaseTag({
				branch: "feature",
				defaultBranch: "main",
				nextReleaseVersion: "2.1.1",
				tags: [
					"0.1.0-main.0",
					"0.1.0",
					"1.0.0-main.0",
					"1.0.0-branch-feature.0",
					"1.0.0",
					"1.0.1-main.0",
					"1.0.1",
					"2.0.0-main.0",
					"2.0.0",
					"2.0.1-main.0",
					"2.1.0-main.0",
					"2.1.0",
					"2.1.1-main.0",
					"2.1.1-1",
					"2.1.1-branch-feature.0",
					"2.1.1-branch-feature.1",
					"2.1.1-branch-feature.2",
					"2.1.1-branch-feature.3",
					"2.1.1-main.2",
				],
			});
			const e = "2.1.1-branch-feature.4";
			assert(n === e);
		});
	});
});
