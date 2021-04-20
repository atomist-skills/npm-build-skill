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

import {
	childProcess,
	EventContext,
	EventHandler,
	github,
	project,
	repository,
	runSteps,
	secret,
	status,
	Step,
	subscription,
} from "@atomist/skill";
import * as fs from "fs-extra";
import * as os from "os";
import * as pRetry from "p-retry";
import * as path from "path";
import * as semver from "semver";

import { extractAnnotations } from "./annotation";
import { Configuration } from "./configuration";
import {
	eventBranch,
	eventCommit,
	eventRepo,
	eventTag,
	gitRefToNpmTag,
	nextPrereleaseTag,
} from "./git";
import { spawnFailure, statusReason, trimDirectory } from "./status";

interface NpmParameters {
	project: project.Project;
	check: github.Check;
	path: string;
	body: string[];
}

type NpmStep = Step<
	EventContext<
		| subscription.types.OnPushSubscription
		| subscription.types.OnTagSubscription,
		Configuration
	>,
	NpmParameters
>;

const LoadProjectStep: NpmStep = {
	name: "load",
	run: async (ctx, params) => {
		const repo = eventRepo(ctx.data);

		const credential = await ctx.credential.resolve(
			secret.gitHubAppToken({
				owner: repo.owner,
				repo: repo.name,
				apiUrl: repo.org.provider.apiUrl,
			}),
		);

		const project: project.Project = await ctx.project.load(
			repository.gitHub({
				owner: repo.owner,
				repo: repo.name,
				credential,
			}),
			process.cwd(),
		);
		params.project = project;

		return status.success();
	},
};

const ValidateStep: NpmStep = {
	name: "validate",
	run: async (ctx, params) => {
		if (!(await fs.pathExists(params.project.path("package.json")))) {
			return status
				.success(`Ignoring push to non-npm project`)
				.hidden()
				.abort();
		}

		// raise the check
		const commit = eventCommit(ctx.data);
		params.check = await github.createCheck(ctx, params.project.id, {
			sha: commit.sha,
			title: "npm",
			name: `${ctx.skill.name}/${ctx.configuration?.name}`,
			body: "Running npm Build",
		});
		params.body = [];

		return status.success();
	},
};

const CommandStep: NpmStep = {
	name: "command",
	runWhen: async ctx => !!ctx.configuration?.parameters?.command,
	run: async (ctx, params) => {
		const repo = eventRepo(ctx.data);
		const commit = eventCommit(ctx.data);
		const result = await childProcess.spawnPromise(
			"bash",
			["-c", ctx.configuration.parameters.command],
			{ log: childProcess.captureLog() },
		);
		if (result.status !== 0) {
			params.body.push(spawnFailure(result));
			await params.check.update({
				conclusion: "failure",
				body: params.body.join("\n\n---\n\n"),
			});
			return status.failure(
				statusReason({
					reason: `\`${result.cmdString}\` failed`,
					repo,
					commit,
				}),
			);
		}
		params.body.push(
			`Setup command \`${trimDirectory(result.cmdString)}\` successful`,
		);
		await params.check.update({
			conclusion: undefined,
			body: params.body.join("\n\n---\n\n"),
		});
		return status.success();
	},
};

const PrepareStep: NpmStep = {
	name: "prepare",
	run: async (ctx, params) => {
		// copy creds
		const npmRc = path.join(os.homedir(), ".npmrc");
		if (process.env.ATOMIST_NPMRC) {
			try {
				await fs.copyFile(process.env.ATOMIST_NPMRC, npmRc);
			} catch (e) {
				const repo = eventRepo(ctx.data);
				const commit = eventCommit(ctx.data);
				const reason = `Failed to copy '${process.env.ATOMIST_NPMRC}' to '${npmRc}'`;
				params.body.push(`${reason}:\n${e.message}`);
				await params.check.update({
					conclusion: "failure",
					body: params.body.join("\n\n---\n\n"),
				});
				return status.failure(statusReason({ reason, repo, commit }));
			}
			params.body.push(`Created \`${npmRc}\``);
		}
		await params.check.update({
			conclusion: undefined,
			body: params.body.join("\n\n---\n\n"),
		});
		return status.success();
	},
};

const SetupNodeStep: NpmStep = {
	name: "setup node",
	run: async (ctx, params) => {
		const repo = eventRepo(ctx.data);
		const commit = eventCommit(ctx.data);
		const cfg = ctx.configuration?.parameters;
		// Set up node version
		let result = await params.project.spawn("bash", [
			"-c",
			`. /opt/.nvm/nvm.sh && nvm install ${cfg.version}`,
		]);
		if (result.status !== 0) {
			params.body.push(spawnFailure(result));
			await params.check.update({
				conclusion: "failure",
				body: params.body.join("\n\n---\n\n"),
			});
			return status.failure(
				statusReason({
					reason: `\`${result.cmdString}\` failed`,
					repo,
					commit,
				}),
			);
		}
		// set the unsafe-prem config
		await params.project.spawn("bash", [
			"-c",
			`. /opt/.nvm/nvm.sh && npm config set unsafe-perm true`,
		]);

		const captureLog = childProcess.captureLog();
		result = await params.project.spawn(
			"bash",
			["-c", `. /opt/.nvm/nvm.sh && nvm which ${cfg.version}`],
			{
				log: captureLog,
				logCommand: false,
			},
		);
		params.path = path.dirname(captureLog.log.trim());
		if (result.status !== 0) {
			params.body.push(spawnFailure(result));
			await params.check.update({
				conclusion: "failure",
				body: params.body.join("\n\n---\n\n"),
			});
			return status.failure(
				statusReason({
					reason: `\`${result.cmdString}\` failed`,
					repo,
					commit,
				}),
			);
		}
		params.body.push(`Installed Node.js version \`${cfg.version}\``);
		await params.check.update({
			conclusion: undefined,
			body: params.body.join("\n\n---\n\n"),
		});
		return status.success();
	},
};

const NpmInstallStep: NpmStep = {
	name: "npm install",
	run: async (ctx, params) => {
		const repo = eventRepo(ctx.data);
		const commit = eventCommit(ctx.data);

		// add /.npm/ to the .npmignore file
		const npmIgnore = params.project.path(".npmignore");
		try {
			if (await fs.pathExists(npmIgnore)) {
				const npmIgnoreContent = await fs.readFile(npmIgnore, "utf8");
				await fs.writeFile(npmIgnore, `${npmIgnoreContent}\n/.npm/`);
			} else {
				await fs.writeFile(npmIgnore, "/.npm/");
			}
		} catch (e) {
			const reason = `Failed to update .npmignore: ${e.message}`;
			params.body.push(reason);
			await params.check.update({
				conclusion: "failure",
				body: params.body.join("\n\n---\n\n"),
			});
			return status.failure(statusReason({ reason, commit, repo }));
		}

		const opts = {
			env: {
				...process.env,
				NODE_ENV: "development",
				PATH: `${params.path}:${process.env.PATH}`,
			},
		};
		let result: childProcess.SpawnPromiseReturns;
		if (await fs.pathExists(params.project.path("package-lock.json"))) {
			result = await params.project.spawn(
				"npm",
				["ci", `--cache=${params.project.path(".npm")}`],
				opts,
			);
		} else {
			result = await params.project.spawn(
				"npm",
				["install", `--cache=${params.project.path(".npm")}`],
				opts,
			);
		}
		if (result.status !== 0) {
			params.body.push(spawnFailure(result));
			await params.check.update({
				conclusion: "failure",
				body: params.body.join("\n\n---\n\n"),
			});
			return status.failure(
				statusReason({
					reason: `\`${result.cmdString}\` failed`,
					repo,
					commit,
				}),
			);
		}
		params.body.push("Installed npm dependencies");
		await params.check.update({
			conclusion: undefined,
			body: params.body.join("\n\n---\n\n"),
		});
		return status.success();
	},
};

const NpmScriptsStep: NpmStep = {
	name: "npm run",
	run: async (ctx, params) => {
		const repo = eventRepo(ctx.data);
		const commit = eventCommit(ctx.data);
		const cfg = ctx.configuration?.parameters;
		const scripts = cfg.scripts || [];

		// Run scripts
		for (const script of scripts) {
			const captureLog = childProcess.captureLog();
			const result = await params.project.spawn(
				"npm",
				["run", "--if-present", script],
				{
					env: {
						...process.env,
						PATH: `${params.path}:${process.env.PATH}`,
					},
					log: captureLog,
					logCommand: false,
				},
			);
			const annotations = extractAnnotations(captureLog.log);
			if (result.status !== 0 || annotations.length > 0) {
				const home = process.env.ATOMIST_HOME || "/atm/home";
				result.stderr = captureLog.log;
				params.body.push(spawnFailure(result));
				await params.check.update({
					conclusion: "failure",
					body: params.body.join("\n\n---\n\n"),
					annotations: annotations.map(r => ({
						annotationLevel: r.severity,
						path: r.path.replace(home + "/", ""),
						startLine: r.line ? +r.line : undefined,
						endLine: r.line ? +r.line : undefined,
						startOffset: r.column ? +r.column : undefined,
						title: r.title,
						message: r.message,
					})),
				});
				return status.failure(
					statusReason({
						reason: `\`${result.cmdString}\` failed`,
						commit,
						repo,
					}),
				);
			} else {
				params.body.push(`npm run \`${script}\` successful`);
				await params.check.update({
					conclusion: undefined,
					body: params.body.join("\n\n---\n\n"),
				});
			}
		}
		if (!shouldPublish(ctx)) {
			await params.check.update({
				conclusion: "success",
				body: params.body.join("\n\n---\n\n"),
			});
		}
		return status.success(
			statusReason({
				reason: `npm build succeeded`,
				commit,
				repo,
			}),
		);
	},
};

const NpmVersionStep: NpmStep = {
	name: "version",
	runWhen: async ctx => shouldPublish(ctx),
	run: async (ctx, params) => {
		const repo = eventRepo(ctx.data);
		const commit = eventCommit(ctx.data);
		const branch = eventBranch(ctx.data);
		const tag = eventTag(ctx.data);

		let pj = await fs.readJson(params.project.path("package.json"));
		const pjVersion =
			pj.version ||
			(await github.nextTag(params.project.id, "patch")) ||
			"0.1.0";

		let version: string;
		if (pj.scripts?.version) {
			await params.project.spawn("npm", ["run", "version"], {
				env: {
					...process.env,
					PATH: `${params.path}:${process.env.PATH}`,
				},
			});
			pj = await fs.readJson(params.project.path("package.json"));
			version = pj.version;
		} else if (tag) {
			const tagVersion = semver.valid(tag.replace(/^v/, ""));
			if (tagVersion) {
				version = tagVersion;
			} else {
				version = `${pjVersion}-${gitRefToNpmTag(tag, "gtag")}`;
			}
		} else {
			const credential = await ctx.credential.resolve(
				secret.gitHubAppToken({
					owner: repo.owner,
					repo: repo.name,
					apiUrl: repo.org.provider.apiUrl,
				}),
			);
			const octokit = github.api({
				apiUrl: repo.org?.provider?.apiUrl,
				credential,
			});

			try {
				version = await pRetry(
					async () => {
						let tags: string[] = [];
						try {
							tags = await octokit.paginate(
								"GET /repos/{owner}/{repo}/tags",
								{
									owner: repo.owner,
									repo: repo.name,
								},
								response => response.data.map(t => t.name),
							);
						} catch (e) {
							e.message = `Failed to list tags for ${repo.owner}/${repo.name}: ${e.message}`;
							throw e;
						}
						const tag = nextPrereleaseTag({
							branch,
							defaultBranch: repo.defaultBranch,
							nextReleaseVersion: pjVersion,
							tags,
						});
						if (
							!ctx.configuration?.parameters?.subscription_filter?.includes(
								"onTag",
							)
						) {
							try {
								await params.project.exec("git", [
									"tag",
									"-a",
									"-m",
									`Version ${tag}`,
									tag,
								]);
							} catch (e) {
								e.message = `Failed to create git tag ${tag}: ${e.message}`;
								throw e;
							}
							try {
								await params.project.exec("git", [
									"push",
									"origin",
									tag,
								]);
							} catch (e) {
								e.message = `Failed to push tag ${tag}: ${e.message}`;
								throw e;
							}
						}
						return tag;
					},
					{
						retries: 5,
						maxTimeout: 2500,
						minTimeout: 1000,
						randomize: true,
					},
				);
			} catch (e) {
				params.body.push(e.message);
				await params.check.update({
					conclusion: "failure",
					body: params.body.join("\n\n---\n\n"),
				});
				return status.failure(
					statusReason({ reason: e.message, commit, repo }),
				);
			}
		}

		const result = await params.project.spawn(
			"npm",
			[
				"version",
				"--allow-same-version",
				"--no-git-tag-version",
				version,
			],
			{
				env: {
					...process.env,
					PATH: `${params.path}:${process.env.PATH}`,
				},
			},
		);
		if (result.status !== 0) {
			params.body.push(spawnFailure(result));
			await params.check.update({
				conclusion: "failure",
				body: params.body.join("\n\n---\n\n"),
			});
			return status.failure(
				statusReason({
					reason: `\`${result.cmdString}\` failed`,
					commit,
					repo,
				}),
			);
		}
		params.body.push(`Set package version to \`${version}\``);
		await params.check.update({
			conclusion: undefined,
			body: params.body.join("\n\n---\n\n"),
		});
		return status.success();
	},
};

const NpmPublishStep: NpmStep = {
	name: "npm publish",
	runWhen: async ctx => shouldPublish(ctx),
	run: async (ctx, params) => {
		const cfg = ctx.configuration?.parameters;
		const repo = eventRepo(ctx.data);
		const commit = eventCommit(ctx.data);
		const branch = eventBranch(ctx.data);
		const tag = eventTag(ctx.data);
		const pj = await fs.readJson(params.project.path("package.json"));

		const args = [];
		if (cfg.access) {
			args.push("--access", cfg.access);
		}
		if (branch) {
			args.push("--tag", gitRefToNpmTag(branch));
		} else {
			const tagVersion = semver.valid(tag.replace(/^v/, ""));
			if (!tagVersion) {
				args.push("--tag", gitRefToNpmTag(tag, "tag"));
			} else if (tagVersion.includes("-")) {
				// prerelease
				args.push("--tag", "next");
			} else {
				// release
				args.push("--tag", "latest");
			}
		}

		const result = await params.project.spawn("npm", ["publish", ...args], {
			env: {
				...process.env,
				PATH: `${params.path}:${process.env.PATH}`,
			},
		});
		if (result.status !== 0) {
			params.body.push(spawnFailure(result));
			await params.check.update({
				conclusion: "failure",
				body: params.body.join("\n\n---\n\n"),
			});
			return status.failure(
				statusReason({
					reason: `\`${result.cmdString}\` failed`,
					commit,
					repo,
				}),
			);
		}

		const tags = cfg.tag || [];
		if (branch && branch === repo.defaultBranch && !tags.includes("next")) {
			tags.push("next");
		}
		const tagErrors: Array<{
			cmdString: string;
			stdout: string;
			stderr: string;
		}> = [];
		for (const tag of tags) {
			const tagResult = await params.project.spawn(
				"npm",
				["dist-tag", "add", `${pj.name}@${pj.version}`, tag],
				{
					env: {
						...process.env,
						PATH: `${params.path}:${process.env.PATH}`,
					},
				},
			);
			if (tagResult.status !== 0) {
				tagErrors.push(tagResult);
			}
		}
		if (tagErrors.length > 0) {
			params.body.push(
				`Failed to create tags:\n\n` +
					"```\n" +
					tagErrors
						.map(
							e =>
								`$ ${e.cmdString}\n` +
								`${(e.stderr || e.stdout || "").trim()}`,
						)
						.join("\n") +
					"\n```\n",
			);
			await params.check.update({
				conclusion: "failure",
				body: params.body.join("\n\n---\n\n"),
			});
			return status.failure(
				statusReason({
					reason: `\`${tagErrors
						.map(e => e.cmdString)
						.join(" && ")}\` failed`,
					commit,
					repo,
				}),
			);
		}
		params.body.push(`Published npm package`);
		await params.check.update({
			conclusion: "success",
			body: params.body.join("\n\n---\n\n"),
		});
		return status.success(
			statusReason({
				reason: `npm build and publish succeeded`,
				commit,
				repo,
			}),
		);
	},
};

export const handler: EventHandler<
	| subscription.types.OnPushSubscription
	| subscription.types.OnTagSubscription,
	Configuration
> = async ctx =>
	runSteps({
		context: ctx,
		steps: [
			LoadProjectStep,
			ValidateStep,
			CommandStep,
			PrepareStep,
			SetupNodeStep,
			NpmInstallStep,
			NpmScriptsStep,
			NpmVersionStep,
			NpmPublishStep,
		],
		parameters: { body: [] },
	});

function shouldPublish(
	ctx: EventContext<
		| subscription.types.OnPushSubscription
		| subscription.types.OnTagSubscription,
		Configuration
	>,
): boolean {
	const repo = eventRepo(ctx.data);
	const branch = eventBranch(ctx.data);
	const tag = eventTag(ctx.data);
	return (
		ctx.configuration?.parameters.publish &&
		ctx.configuration?.parameters.publish !== "no" &&
		(!!tag ||
			(branch && ctx.configuration?.parameters.publish === "all") ||
			branch === repo.defaultBranch)
	);
}
