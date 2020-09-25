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
import { nextPrereleaseTag } from "../lib/tag";

describe("tag", () => {
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
