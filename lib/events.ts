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
	guid,
	project,
	repository,
	runSteps,
	secret,
	slack,
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
import { cleanGitRef, gitRefToNpmTag, nextPrereleaseTag } from "./git";
import { Configuration } from "./configuration";

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
		const repo =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.repo ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit
				?.repo;

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
				.success(`Ignoring push to non-NPM project`)
				.hidden()
				.abort();
		}
		return status.success();
	},
};

const CommandStep: NpmStep = {
	name: "command",
	runWhen: async ctx => !!ctx.configuration?.parameters?.command,
	run: async ctx => {
		const repo =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.repo ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit
				?.repo;
		const commit =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.after ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit;
		const result = await childProcess.spawnPromise(
			"bash",
			["-c", ctx.configuration?.parameters?.command],
			{
				log: childProcess.captureLog(),
			},
		);
		if (result.status !== 0) {
			return status.failure(
				`Failed to run command on [${repo.owner}/${
					repo.name
				}/${commit.sha.slice(0, 7)}](${commit.url})`,
			);
		}
		return status.success();
	},
};

const PrepareStep: NpmStep = {
	name: "prepare",
	run: async (ctx, params) => {
		const commit =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.after ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit;
		// copy creds
		const npmRc = path.join(os.homedir(), ".npmrc");
		if (process.env.ATOMIST_NPMRC) {
			await fs.copyFile(process.env.ATOMIST_NPMRC, npmRc);
		}

		// raise the check
		params.check = await github.createCheck(ctx, params.project.id, {
			sha: commit.sha,
			title: "npm run",
			name: `${ctx.skill.name}/${ctx.configuration?.name}/run`,
			body: `Running \`npm run --if-present ${ctx.configuration?.parameters?.scripts.join(
				" ",
			)}\``,
		});

		return status.success();
	},
};

const SetupNodeStep: NpmStep = {
	name: "setup node",
	run: async (ctx, params) => {
		const repo =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.repo ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit
				?.repo;
		const commit =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.after ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit;
		const cfg = ctx.configuration?.parameters;
		// Set up node version
		let result = await params.project.spawn("bash", [
			"-c",
			`source $HOME/.nvm/nvm.sh && nvm install ${cfg.version}`,
		]);
		if (result.status !== 0) {
			await params.check.update({
				conclusion: "failure",
				body: "`nvm install` failed",
			});
			return status.failure(
				`\`nvm install\` failed on [${repo.owner}/${
					repo.name
				}/${commit.sha.slice(0, 7)}](${commit.url})`,
			);
		}
		// set the unsafe-prem config
		await params.project.spawn("bash", [
			"-c",
			`source $HOME/.nvm/nvm.sh && npm config set unsafe-perm true`,
		]);

		const captureLog = childProcess.captureLog();
		result = await params.project.spawn(
			"bash",
			["-c", `source $HOME/.nvm/nvm.sh && nvm which ${cfg.version}`],
			{
				log: captureLog,
				logCommand: false,
			},
		);
		params.path = path.dirname(captureLog.log.trim());
		if (result.status !== 0) {
			await params.check.update({
				conclusion: "failure",
				body: "`nvm which` failed",
			});
			return status.failure(
				`\`nvm which\` failed on [${repo.owner}/${
					repo.name
				}/${commit.sha.slice(0, 7)}](${commit.url})`,
			);
		}
		return status.success();
	},
};

const NpmInstallStep: NpmStep = {
	name: "npm install",
	run: async (ctx, params) => {
		const repo =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.repo ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit
				?.repo;
		const commit =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.after ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit;
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
			await params.check.update({
				conclusion: "failure",
				body: "`npm install` failed",
			});
			return status.failure(
				`\`npm install\` failed on [${repo.owner}/${
					repo.name
				}/${commit.sha.slice(0, 7)}](${commit.url})`,
			);
		}
		return status.success();
	},
};

const NpmScriptsStep: NpmStep = {
	name: "npm run",
	run: async (ctx, params) => {
		const repo =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.repo ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit
				?.repo;
		const commit =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.after ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit;
		const cfg = ctx.configuration?.parameters;
		const scripts = cfg.scripts;

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
				await params.check.update({
					conclusion: "failure",
					body: `${
						params.body.length > 0
							? `${params.body.join("\n\n---\n\n")}\n\n---\n\n`
							: ""
					}Running \`npm run --if-present ${script}\` errored:

\`\`\`
${captureLog.log.trim()}
\`\`\``,
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
					`\`npm run ${script}\` failed on [${repo.owner}/${
						repo.name
					}/${commit.sha.slice(0, 7)}](${commit.url})`,
				);
			} else {
				params.body.push(
					`Running \`npm run --if-present ${script}\` completed successfully`,
				);
				await params.check.update({
					conclusion: undefined,
					body: params.body.join("\n\n---\n\n"),
				});
			}
		}
		await params.check.update({
			conclusion: "success",
			body: params.body.join("\n\n---\n\n"),
		});
		return status.success(
			`\`npm run ${scripts.join(" ")}\` passed on [${repo.owner}/${
				repo.name
			}/${commit.sha.slice(0, 7)}](${commit.url})`,
		);
	},
};

const NpmVersionStep: NpmStep = {
	name: "version",
	runWhen: async ctx =>
		ctx.configuration?.parameters.publish &&
		ctx.configuration?.parameters.publish !== "no",
	run: async (ctx, params) => {
		const repo =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.repo ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit
				?.repo;
		const commit =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.after ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit;
		const branch = (ctx.data as subscription.types.OnPushSubscription)
			.Push?.[0]?.branch;
		const tag = (ctx.data as subscription.types.OnTagSubscription).Tag?.[0]
			?.name;

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

			version = await pRetry(
				async () => {
					const tags = await octokit.paginate(
						"GET /repos/:owner/:repo/tags",
						{
							owner: repo.owner,
							repo: repo.name,
						},
						response => response.data.map(t => t.name),
					);
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
						await params.project.exec("git", [
							"tag",
							"-a",
							"-m",
							`Version ${tag}`,
							tag,
						]);
						await params.project.exec("git", [
							"push",
							"origin",
							tag,
						]);
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
			await params.check.update({
				conclusion: "failure",
				body: "`npm version` failed",
			});
			return status.failure(
				`\`npm version\` failed on [${repo.owner}/${
					repo.name
				}/${commit.sha.slice(0, 7)}](${commit.url})`,
			);
		}
		return status.success();
	},
};

const NpmPublishStep: NpmStep = {
	name: "npm publish",
	runWhen: async ctx => {
		const repo =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.repo ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit
				?.repo;
		const branch = (ctx.data as subscription.types.OnPushSubscription)
			.Push?.[0]?.branch;
		const tag = (ctx.data as subscription.types.OnTagSubscription).Tag?.[0]
			?.name;
		return (
			ctx.configuration?.parameters.publish &&
			ctx.configuration?.parameters.publish !== "no" &&
			(!!tag ||
				(branch && ctx.configuration?.parameters.publish === "all") ||
				branch === repo.defaultBranch)
		);
	},
	run: async (ctx, params) => {
		const cfg = ctx.configuration?.parameters;
		const repo =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.repo ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit
				?.repo;
		const commit =
			(ctx.data as subscription.types.OnPushSubscription).Push?.[0]
				?.after ||
			(ctx.data as subscription.types.OnTagSubscription).Tag?.[0]?.commit;
		const branch = (ctx.data as subscription.types.OnPushSubscription)
			.Push?.[0]?.branch;
		const tag = (ctx.data as subscription.types.OnTagSubscription).Tag?.[0]
			?.name;
		const pj = await fs.readJson(params.project.path("package.json"));

		// add /.npm/ to the .npmignore file
		const npmIgnore = params.project.path(".npmignore");
		if (await fs.pathExists(npmIgnore)) {
			const npmIgnoreContent = await fs.readFile(npmIgnore, "utf8");
			await fs.writeFile(npmIgnore, `${npmIgnoreContent}\n/.npm/`);
		} else {
			await fs.writeFile(npmIgnore, "/.npm/");
		}

		const args = [];
		if (cfg.access) {
			args.push("--access", cfg.access);
		}
		if (branch) {
			args.push("--tag", gitRefToNpmTag(branch));
		} else {
			const tagVersion = semver.valid(tag.replace(/^v/, ""));
			if (!tagVersion || tagVersion.includes("-")) {
				args.push("--tag", cleanGitRef(tag));
			}
			// no tag for release versions, so latest gets applied by default
		}

		const check = await github.createCheck(ctx, params.project.id, {
			sha: commit.sha,
			title: "npm publish",
			name: `${ctx.skill.name}/${ctx.configuration?.name}/publish`,
			body: `Running \`npm publish ${args.join(" ")}\``,
		});
		const id = guid();
		const channels = repo?.channels?.map(c => c.name);
		const header = `*${repo.owner}/${repo.name}/${branch}* at <${
			commit.url
		}|\`${commit.sha.slice(0, 7)}\`>\n`;
		await ctx.message.send(
			slack.progressMessage(
				"npm publish",
				`${header}
\`\`\`
Publishing ${pj.name}
\`\`\``,
				{
					counter: false,
					state: "in_process",
					count: 0,
					total: 1,
				},
				ctx,
			),
			{ channels },
			{ id },
		);

		const captureLog = childProcess.captureLog();
		const result = await params.project.spawn("npm", ["publish", ...args], {
			env: { ...process.env, PATH: `${params.path}:${process.env.PATH}` },
			log: captureLog,
			logCommand: false,
		});
		if (result.status !== 0) {
			await check.update({
				conclusion: "failure",
				body: `Running \`npm publish ${args.join(" ")}\` errored:
\`\`\`
${captureLog.log.trim()}
\`\`\``,
			});
			await ctx.message.send(
				slack.progressMessage(
					"npm publish",
					`${header}
\`\`\`
Failed to publish ${pj.name}
\`\`\``,
					{
						counter: false,
						state: "failure",
						count: 0,
						total: 1,
					},
					ctx,
				),
				{ channels },
				{ id },
			);
			return status.failure(
				`\`npm publish ${args.join(" ")}\` failed on [${repo.owner}/${
					repo.name
				}/${commit.sha.slice(0, 7)}](${commit.url})`,
			);
		}

		const tags = cfg.tag || [];
		if (branch && branch === repo.defaultBranch) {
			tags.push("next");
		}
		for (const tag of tags) {
			await params.project.spawn(
				"npm",
				["dist-tag", "add", `${pj.name}@${pj.version}`, tag],
				{
					env: {
						...process.env,
						PATH: `${params.path}:${process.env.PATH}`,
					},
				},
			);
		}

		await check.update({
			conclusion: "success",
			body: `Running \`npm publish ${args.join(
				" ",
			)}\` completed successfully:
\`\`\`
${captureLog.log.trim()}
\`\`\``,
		});
		await ctx.message.send(
			slack.progressMessage(
				"npm publish",
				`${header}
\`\`\`
Successfully published ${pj.name} with version ${pj.version}
\`\`\``,
				{
					counter: false,
					state: "success",
					count: 1,
					total: 1,
				},
				ctx,
			),
			{ channels },
			{ id },
		);
		return status.success(
			`\`npm publish ${args.join(" ")}\` passed on [${repo.owner}/${
				repo.name
			}/${commit.sha.slice(0, 7)}](${commit.url})`,
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
