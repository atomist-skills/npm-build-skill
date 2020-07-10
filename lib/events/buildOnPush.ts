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
} from "@atomist/skill";
import * as df from "dateformat";
import * as fs from "fs-extra";
import * as _ from "lodash";
import * as os from "os";
import * as path from "path";
import { Configuration } from "../configuration";
import { BuildOnPushSubscription } from "../typings/types";

const Matchers = [
    {
        name: "npm",
        severity: "error",
        report: "always",
        pattern: [
            // TypeScript < 3.9 compile output
            {
                regexp: "^(.*):([0-9]+):([0-9]+)\\s-\\s([\\S]+)\\s(.*):\\s(.*)\\.$",
                groups: {
                    path: 1,
                    line: 2,
                    column: 3,
                    severity: 4,
                    title: 5,
                    message: 6,
                },
            },
            // TypeScript 3.9 compile output
            {
                regexp: "^(.*)\\(([0-9]+),([0-9]+)\\):\\s([\\S]+)\\s(.*):\\s(.*)\\.$",
                groups: {
                    path: 1,
                    line: 2,
                    column: 3,
                    severity: 4,
                    title: 5,
                    message: 6,
                },
            },
        ],
    },
];

interface NpmParameters {
    project: project.Project;
    check: github.Check;
    path: string;
    body: string[];
}

type NpmStep = Step<EventContext<BuildOnPushSubscription, Configuration>, NpmParameters>;

const LoadProjectStep: NpmStep = {
    name: "load",
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const repo = push.repo;

        const credential = await ctx.credential.resolve(
            secret.gitHubAppToken({ owner: repo.owner, repo: repo.name, apiUrl: repo.org.provider.apiUrl }),
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
            return status.failure(`Ignoring push to non-NPM project`).hidden();
        }
        return status.success();
    },
};

const PrepareStep: NpmStep = {
    name: "prepare",
    run: async (ctx, params) => {
        // copy creds
        const npmRc = path.join(os.homedir(), ".npmrc");
        if (process.env.NPM_NPMJS_CREDENTIALS) {
            await fs.copyFile(process.env.NPM_NPMJS_CREDENTIALS, npmRc);
        }

        // raise the check
        params.check = await github.createCheck(ctx, params.project.id, {
            sha: ctx.data.Push[0].after.sha,
            title: "npm run",
            name: `${ctx.skill.name}/${ctx.configuration?.[0]?.name}/run`,
            body: `Running \`npm run --if-present ${ctx.configuration?.[0]?.parameters?.scripts.join(" ")}\``,
        });

        return status.success();
    },
};

const SetupNodeStep: NpmStep = {
    name: "setup node",
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const cfg = ctx.configuration?.[0]?.parameters;
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
                `\`nvm install\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(0, 7)}](${
                    push.after.url
                })`,
            );
        }
        // set the unsafe-prem config
        await params.project.spawn("bash", ["-c", `source $HOME/.nvm/nvm.sh && npm config set unsafe-perm true`]);

        const captureLog = childProcess.captureLog();
        result = await params.project.spawn("bash", ["-c", `source $HOME/.nvm/nvm.sh && nvm which ${cfg.version}`], {
            log: captureLog,
            logCommand: false,
        });
        params.path = path.dirname(captureLog.log.trim());
        if (result.status !== 0) {
            await params.check.update({
                conclusion: "failure",
                body: "`nvm which` failed",
            });
            return status.failure(
                `\`nvm which\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(0, 7)}](${
                    push.after.url
                })`,
            );
        }
        return undefined;
    },
};

const NpmInstallStep: NpmStep = {
    name: "npm install",
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const opts = { env: { ...process.env, NODE_ENV: "development", PATH: `${params.path}:${process.env.PATH}` } };
        let result;
        if (await fs.pathExists(params.project.path("package-lock.json"))) {
            result = await params.project.spawn("npm", ["ci", `--cache=${params.project.path(".npm")}`], opts);
        } else {
            result = await params.project.spawn("npm", ["install", `--cache=${params.project.path(".npm")}`], opts);
        }
        if (result.status !== 0) {
            await params.check.update({
                conclusion: "failure",
                body: "`npm install` failed",
            });
            return status.failure(
                `\`npm install\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(0, 7)}](${
                    push.after.url
                })`,
            );
        }
        return undefined;
    },
};

const NodeVersionStep: NpmStep = {
    name: "version",
    runWhen: async (ctx, params) => {
        const pj = await fs.readJson(params.project.path("package.json"));
        return !pj.scripts?.version;
    },
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const pj = await fs.readJson(params.project.path("package.json"));
        const branch = ctx.data.Push[0].branch.split("/").join(".");
        const branchSuffix = `${branch}.`;

        let pjVersion = pj.version;
        if (!pjVersion || pjVersion.length === 0) {
            pjVersion = "0.1.0";
        }

        const version = `${pjVersion}-${gitBranchToNpmVersion(branchSuffix)}${formatDate()}`;
        const result = await params.project.spawn("npm", ["version", "--no-git-tag-version", version], {
            env: { ...process.env, PATH: `${params.path}:${process.env.PATH}` },
        });
        if (result.status !== 0) {
            await params.check.update({
                conclusion: "failure",
                body: "`npm version` failed",
            });
            return status.failure(
                `\`npm version\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(0, 7)}](${
                    push.after.url
                })`,
            );
        }
        return undefined;
    },
};

function gitBranchToNpmVersion(branchName: string): string {
    // prettier-ignore
    return branchName.replace(/\//g, "-").replace(/_/g, "-").replace(/@/g, "");
}

function formatDate(date = new Date(), format = "yyyymmddHHMMss", utc = true) {
    return df(date, format, utc);
}

const NpmScriptsStep: NpmStep = {
    name: "npm run",
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const cfg = ctx.configuration?.[0]?.parameters;
        let scripts = cfg.scripts;

        // Test if the project overwrites the version step
        const pj = await fs.readJson(params.project.path("package.json"));
        if (pj.scripts.version) {
            scripts = ["version", ...scripts];
        }

        // Run scripts
        for (const script of scripts) {
            const captureLog = childProcess.captureLog();
            const result = await params.project.spawn("npm", ["run", "--if-present", script], {
                env: { ...process.env, PATH: `${params.path}:${process.env.PATH}` },
                log: captureLog,
                logCommand: false,
            });
            const annotations = extractAnnotations(captureLog.log);
            if (result.status !== 0 || annotations.length > 0) {
                const home = process.env.ATOMIST_HOME || "/atm/home";
                await params.check.update({
                    conclusion: "failure",
                    body: `${
                        params.body.length > 0 ? `${params.body.join("\n\n---\n\n")}\n\n---\n\n` : ""
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
                    `\`npm run ${script}\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(
                        0,
                        7,
                    )}](${push.after.url})`,
                );
            } else {
                params.body.push(`Running \`npm run --if-present ${script}\` completed successfully`);
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
            `\`npm run ${scripts.join(" ")}\` passed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(
                0,
                7,
            )}](${push.after.url})`,
        );
    },
};

export interface Annotation {
    path: string;
    line: number;
    column: number;
    severity: "failure" | "notice" | "warning";
    title: string;
    message: string;
}

function extractAnnotations(lines: string): Annotation[] {
    const logs = lines.split("\n");
    const annotations = [];
    for (const matcher of Matchers) {
        for (const pattern of matcher.pattern) {
            for (const l of logs) {
                const match = new RegExp(pattern.regexp, "g").exec(l.trim());
                if (match) {
                    annotations.push({
                        match: match[0],
                        path: match[pattern.groups.path],
                        line: match[pattern.groups.line],
                        column: match[pattern.groups.column],
                        severity: mapSeverity((match[pattern.groups.severity] || "error").toLowerCase()),
                        message: match[pattern.groups.message],
                        title: match[pattern.groups.title],
                    });
                }
            }
        }
    }
    return annotations;
}

function mapSeverity(severity: string): "notice" | "warning" | "failure" {
    switch (severity.toLowerCase()) {
        case "error":
            return "failure";
        case "warning":
        case "warn":
            return "warning";
        case "info":
        case "information":
            return "notice";
        default:
            return "notice";
    }
}

const NpmPublishStep: NpmStep = {
    name: "npm publish",
    runWhen: async ctx => ctx.configuration?.[0]?.parameters.publish,
    run: async (ctx, params) => {
        const cfg = ctx.configuration?.[0]?.parameters;
        const push = ctx.data.Push[0];

        const args = [];
        if (cfg.access) {
            args.push("--access", cfg.access);
        }
        if (cfg.tag) {
            args.push(..._.flatten(cfg.tag.map(t => ["--tag", t])));
        } else {
            args.push("--tag", gitBranchToNpmTag(push.branch));
        }

        const check = await github.createCheck(ctx, params.project.id, {
            sha: ctx.data.Push[0].after.sha,
            title: "npm publish",
            name: `${ctx.skill.name}/${ctx.configuration?.[0]?.name}/publish`,
            body: `Running \`npm publish ${args.join(" ")}\``,
        });

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
            return status.failure(
                `\`npm publish ${args.join(" ")}\` failed on [${push.repo.owner}/${
                    push.repo.name
                }/${push.after.sha.slice(0, 7)}](${push.after.url})`,
            );
        }
        await check.update({
            conclusion: "success",
            body: `Running \`npm publish ${args.join(" ")}\` completed successfully:
\`\`\`
${captureLog.log.trim()}
\`\`\``,
        });
        return status.success(
            `\`npm publish ${args.join(" ")}\` passed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(
                0,
                7,
            )}](${push.after.url})`,
        );
    },
};

function gitBranchToNpmTag(branchName: string): string {
    return `branch-${gitBranchToNpmVersion(branchName)}`;
}

const GitTagStep: NpmStep = {
    name: "git tag",
    run: async (ctx, params) => {
        const pj = await fs.readJson(params.project.path("package.json"));
        await params.project.spawn("git", ["tag", "-m", `Version ${pj.version}`, pj.version]);
        await params.project.spawn("git", ["push", "origin", pj.version]);
        return undefined;
    },
};

export const handler: EventHandler<BuildOnPushSubscription, Configuration> = async ctx => {
    return runSteps({
        context: ctx,
        steps: [
            LoadProjectStep,
            ValidateStep,
            PrepareStep,
            SetupNodeStep,
            NpmInstallStep,
            NodeVersionStep,
            NpmScriptsStep,
            NpmPublishStep,
            GitTagStep,
        ],
    });
};
