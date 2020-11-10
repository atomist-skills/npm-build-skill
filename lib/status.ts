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

/** Create message from spawnPromise failure. */
export function spawnFailure(result: {
	cmdString: string;
	stdout: string;
	stderr: string;
}): string {
	return (
		"Failed to run command:\n\n" +
		"```\n" +
		`$ ${result.cmdString}\n` +
		`${(result.stderr || result.stdout || "").trim()}\n` +
		"```\n"
	);
}

/** Provide standard skill status reason string. */
export function statusReason(args: {
	reason: string;
	repo: { name?: string; owner?: string };
	commit: { sha?: string; url?: string };
}): string {
	let tail = "";
	if (args.repo.name && args.repo.owner) {
		let slug = `${args.repo.owner}/${args.repo.name}`;
		if (args.commit.sha) {
			slug += `#${args.commit.sha.slice(0, 7)}`;
		}
		if (args.commit.url) {
			slug = `[${slug}](${args.commit.url})`;
		}
		tail = ` on ${slug}`;
	}
	return `${args.reason}${tail}`;
}
