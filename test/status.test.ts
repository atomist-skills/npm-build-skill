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

import { spawnFailure, statusReason } from "../lib/status";

describe("status", () => {
	describe("spawnFailure", () => {
		it("uses stderr", () => {
			const f = spawnFailure({
				cmdString: "ls -al",
				stdout: "out",
				stderr: "error",
			});
			const e = "Failed to run command:\n\n```\n$ ls -al\nerror\n```\n";
			assert(f === e);
		});

		it("uses multiline stderr", () => {
			const f = spawnFailure({
				cmdString: "ls -al",
				stdout: "out",
				stderr: "\nthis is\nan error\n\na real one\n",
			});
			const e =
				"Failed to run command:\n\n```\n$ ls -al\nthis is\nan error\n\na real one\n```\n";
			assert(f === e);
		});

		it("uses stdout if no stderr", () => {
			const f = spawnFailure({
				cmdString: "ls -al",
				stdout: "out",
				stderr: undefined,
			});
			const e = "Failed to run command:\n\n```\n$ ls -al\nout\n```\n";
			assert(f === e);
		});
	});

	describe("statusReason", () => {
		it("returns reason", () => {
			const m = "Something happened";
			const r = statusReason({ reason: m, repo: {}, commit: {} });
			assert(r === m);
		});

		it("returns reason with owner/repo", () => {
			const r = statusReason({
				reason: "Something happened",
				repo: { name: "grant", owner: "hart" },
				commit: {},
			});
			const e = "Something happened on hart/grant";
			assert(r === e);
		});

		it("returns reason with owner/repo#sha", () => {
			const r = statusReason({
				reason: "Something happened",
				repo: { name: "grant", owner: "hart" },
				commit: { sha: "abcdef0123456789" },
			});
			const e = "Something happened on hart/grant#abcdef0";
			assert(r === e);
		});

		it("returns reason with link", () => {
			const r = statusReason({
				reason: "Something happened",
				repo: { name: "grant", owner: "hart" },
				commit: {
					sha: "abcdef0123456789",
					url: "https://github.com/hart/grant/2541",
				},
			});
			const e =
				"Something happened on [hart/grant#abcdef0](https://github.com/hart/grant/2541)";
			assert(r === e);
		});
	});
});
