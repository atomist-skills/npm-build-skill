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

import * as semver from "semver";
import { cleanGitBranch } from "./branch";

export interface NextPrereleaseTagArgs {
	/** Current branch */
	branch: string;
	/** Repository default branch */
	defaultBranch: string;
	/** Next release version */
	nextReleaseVersion: string;
	/** Current tags */
	tags: string[];
}

/**
 * Return the next prerelease semantic version tag.
 */
export function nextPrereleaseTag(args: NextPrereleaseTagArgs): string {
	if (args.tags.includes(args.nextReleaseVersion)) {
		throw new Error(
			`Current tags already include next release version: ${args.nextReleaseVersion}`,
		);
	}
	const semverTags = args.tags.filter(t => semver.valid(t));
	const cleanBranch = cleanGitBranch(args.branch);
	const nextVersion = args.nextReleaseVersion;
	const prefixRegExp =
		args.branch !== args.defaultBranch
			? RegExp(`^${nextVersion}-${cleanBranch}\\.(?:0|[1-9]\\d*)$`)
			: RegExp(`^${nextVersion}-(?:0|[1-9]\\d*)$`);
	const matchingTags = semverTags.filter(t => prefixRegExp.test(t));
	const sortedTags = matchingTags.sort((t1, t2) => semver.compare(t2, t1));
	if (sortedTags.length < 1) {
		return (
			`${nextVersion}-` +
			(args.branch !== args.defaultBranch ? `${cleanBranch}.` : "") +
			"0"
		);
	}
	return semver.inc(sortedTags[0], "prerelease");
}