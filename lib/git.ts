/*
 * Copyright © 2022 Atomist, Inc.
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

import { subscription } from "@atomist/skill";
import * as semver from "semver";

/**
 * Remove non-tag-worthy, non-semver-prerelease characters from git
 * branch.
 */
export function cleanGitRef(refName: string): string {
	return refName
		.replace(/\//g, "-")
		.replace(/_/g, "-")
		.replace(/[^0-9A-Za-z.-]/g, "")
		.replace(/\.+/g, ".");
}

/** Return cleaned name prepended with `prefix-`. */
export function gitRefToNpmTag(branchName: string, prefix = "branch"): string {
	return `${prefix}-${cleanGitRef(branchName)}`;
}

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
	const cleanBranch = cleanGitRef(args.branch);
	const prereleaseBranch =
		args.branch === args.defaultBranch
			? cleanBranch
			: `branch-${cleanBranch}`;
	const nextVersion = args.nextReleaseVersion;
	const prefixRegExp = RegExp(
		`^${nextVersion}-${prereleaseBranch}\\.(?:0|[1-9]\\d*)$`,
	);
	const matchingTags = semverTags.filter(t => prefixRegExp.test(t));
	const sortedTags = matchingTags.sort((t1, t2) => semver.compare(t2, t1));
	if (sortedTags.length < 1) {
		return `${nextVersion}-${prereleaseBranch}.0`;
	}
	return semver.inc(sortedTags[0], "prerelease");
}

export type EventSubscription = subscription.datalog.OnPush;

/** Extract commit from event data. */
export function eventCommit(data: EventSubscription): {
	sha?: string;
	url?: string;
} {
	return {
		sha: data.commit.sha,
	};
}

/** Extract repo from event data. */
export function eventRepo(data: EventSubscription): {
	channels?: Array<{ name?: string }>;
	defaultBranch?: string;
	name?: string;
	owner?: string;
	installationToken: string;
} {
	return {
		channels: [],
		name: data.commit.repo.name,
		owner: data.commit.repo.org.name,
		defaultBranch: data.commit.repo.defaultBranch,
		installationToken: data.commit.repo.org.installationToken,
	};
}

/**
 * Extract branch from even data. Will be `undefined` for
 * tag-triggered events.
 */
export function eventBranch(data: EventSubscription): string | undefined {
	return data.commit.refs?.find(r => r.type === "branch")?.name;
}

/**
 * Extract branch from even data. Will be `undefined` for
 * commit-triggered events.
 */
export function eventTag(data: EventSubscription): string | undefined {
	return undefined;
}
