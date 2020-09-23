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
import { cleanGitBranch, gitBranchToNpmTag } from "../lib/branch";

describe("branch", () => {
	describe("cleanGitBranch", () => {
		it("does nothing to clean branch", () => {
			["main", "nothing", "gh-pages", "clean-branch-name"].forEach(b => {
				const c = cleanGitBranch(b);
				assert(c === b);
			});
		});

		it("cleans branch", () => {
			[
				{ b: "mainly@main", e: "mainlymain" },
				{ b: "mainly_@_main", e: "mainly--main" },
				{ b: "main/ly_@_main", e: "main-ly--main" },
			].forEach(be => {
				const c = cleanGitBranch(be.b);
				assert(c === be.e);
			});
		});
	});

	describe("gitBranchToNpmTag", () => {
		it("prepends to clean branch", () => {
			["main", "nothing", "gh-pages", "clean-branch-name"].forEach(b => {
				const c = gitBranchToNpmTag(b);
				const e = `branch-${b}`;
				assert(c === e);
			});
		});

		it("cleans and prepends branch", () => {
			[
				{ b: "mainly@main", e: "branch-mainlymain" },
				{ b: "mainly_@_main", e: "branch-mainly--main" },
				{ b: "main/ly_@_main", e: "branch-main-ly--main" },
			].forEach(be => {
				const c = gitBranchToNpmTag(be.b);
				assert(c === be.e);
			});
		});
	});
});
