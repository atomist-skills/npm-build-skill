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
    EventContext,
    EventHandler,
    github,
    log,
    project,
    repository,
    runSteps,
    secret,
    Step,
    childProcess,
} from "@atomist/skill";
import * as df from "dateformat";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Configuration } from "../configuration";
import { BuildOnPushSubscription } from "../typings/types";
import * as _ from "lodash";

interface NpmParameters {
    project: project.Project;
    version: string;
    check: github.Check;
    path: string;
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

        return {
            visibility: "hidden",
            code: 0,
        };
    },
};

const ValidateStep: NpmStep = {
    name: "validate",
    run: async (ctx, params) => {
        if (!(await fs.pathExists(params.project.path("package.json")))) {
            return {
                visibility: "hidden",
                code: 1,
                reason: `Ignoring push to non-NPM project`,
            };
        }
        return {
            visibility: "hidden",
            code: 0,
        };
    },
};

const PrepareStep: NpmStep = {
    name: "prepare",
    run: async (ctx, params) => {
        // copy matcher
        // const matcher = {
        //     name: "npm",
        //     severity: "error",
        //     report: "always",
        //     pattern: [
        //         // TypeScript compile output
        //         {
        //             regexp: "^(.*):([0-9]+):([0-9]+)\\s-\\s([\\S]+)\\s(.*):\\s(.*)\\.$",
        //             groups: {
        //                 path: 1,
        //                 line: 2,
        //                 column: 3,
        //                 severity: 4,
        //                 title: 5,
        //                 message: 6,
        //             },
        //         },
        //     ],
        // };
        // await fs.writeJson(path.join(process.env.ATOMIST_MATCHERS_DIR, "npm.matcher.json"), matcher);

        // copy creds
        const npmRc = path.join(os.homedir(), ".npmrc");
        if (process.env.NPM_NPMJS_CREDENTIALS) {
            log.debug(`Provisioning NPM credentials to '${npmRc}'`);
            await fs.copyFile(process.env.NPM_NPMJS_CREDENTIALS, npmRc);
        }

        // raise the check
        params.check = await github.openCheck(ctx, params.project.id, {
            sha: ctx.data.Push[0].after.sha,
            title: "npm",
            name: `${ctx.skill.name}/run`,
            body: `Running \`npm run ${ctx.configuration?.[0]?.parameters?.scripts.join(" ")}\``,
        });

        return {
            visibility: "hidden",
            code: 0,
        };
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
            return {
                code: result.status,
                reason: `\`nvm install\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(
                    0,
                    7,
                )}](${push.after.url})`,
            };
        }
        // set the unsafe-prem config
        await params.project.spawn("bash", ["-c", `source $HOME/.nvm/nvm.sh && npm config set unsafe-perm true`]);

        const lines = [];
        result = await params.project.spawn("bash", ["-c", `source $HOME/.nvm/nvm.sh && nvm which ${cfg.version}`], {
            log: { write: msg => lines.push(msg) },
            logCommand: false,
        });
        params.path = path.dirname(lines.join("\n").trim());
        log.debug(`Node and NPM path set to: ${params.path}`);
        if (result.status !== 0) {
            await params.check.update({
                conclusion: "failure",
                body: "`nvm which` failed",
            });
            return {
                code: result.status,
                reason: `\`nvm which\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(0, 7)}](${
                    push.after.url
                })`,
            };
        }
        return undefined;
    },
};

const NodeVersionStep: NpmStep = {
    name: "version",
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
        params.version = version;
        const result = await params.project.spawn("npm", ["version", "--no-git-tag-version", version], {
            env: { ...process.env, PATH: `${params.path}:${process.env.PATH}` },
        });
        if (result.status !== 0) {
            await params.check.update({
                conclusion: "failure",
                body: "`npm version` failed",
            });
            return {
                code: result.status,
                reason: `\`npm version\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(
                    0,
                    7,
                )}](${push.after.url})`,
            };
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
            return {
                code: result.status,
                reason: `\`npm install\` failed on [${push.repo.owner}/${push.repo.name}/${push.after.sha.slice(
                    0,
                    7,
                )}](${push.after.url})`,
            };
        }
        return undefined;
    },
};

const NpmScriptsStep: NpmStep = {
    name: "npm run",
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const cfg = ctx.configuration?.[0]?.parameters;
        const scripts = cfg.scripts;
        // Run scripts
        for (const script of scripts) {
            const lines = [];
            const result = await params.project.spawn("npm", ["run", "--if-present", script], {
                env: { ...process.env, PATH: `${params.path}:${process.env.PATH}` },
                log: {
                    write: msg => {
                        lines.push(msg);
                        childProcess.ConsoleLog.write(msg);
                    },
                },
                logCommand: false,
            });
            if (result.status !== 0) {
                await params.check.update({
                    conclusion: "failure",
                    body: `Running \`npm run --if-present ${script}\` errored:

\`\`\`
${lines.join("\n")}
\`\`\``,
                });
                return {
                    code: result.status,
                    reason: `\`npm run ${script}\` failed on [${push.repo.owner}/${
                        push.repo.name
                    }/${push.after.sha.slice(0, 7)}](${push.after.url})`,
                };
            }
        }
        await params.check.update({
            conclusion: "success",
        });
        return {
            code: 0,
            reason: `\`npm run ${scripts.join(" ")}\` passed on [${push.repo.owner}/${
                push.repo.name
            }/${push.after.sha.slice(0, 7)}](${push.after.url})`,
        };
    },
};

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

        const check = await github.openCheck(ctx, params.project.id, {
            sha: ctx.data.Push[0].after.sha,
            title: "npm publish",
            name: `${ctx.skill.name}/publish`,
            body: `Running \`npm publish ${args.join("")}\``,
        });

        const lines = [];
        const result = await params.project.spawn("npm", ["publish", ...args], {
            env: { ...process.env, PATH: `${params.path}:${process.env.PATH}` },
            log: {
                write: msg => {
                    lines.push(msg);
                    childProcess.ConsoleLog.write(msg);
                },
            },
            logCommand: false,
        });
        if (result.status !== 0) {
            await check.update({
                conclusion: "failure",
                body: `Running \`npm publish ${args.join("")}\` errored:
\`\`\`
${lines.join("\n")}
\`\`\``,
            });
            return {
                code: result.status,
                reason: `\`npm publish ${args.join(" ")}\` failed on [${push.repo.owner}/${
                    push.repo.name
                }/${push.after.sha.slice(0, 7)}](${push.after.url})`,
            };
        }
        await check.update({
            conclusion: "success",
            body: `Running \`npm publish ${args.join("")}\` completed successfully:
\`\`\`
${lines.join("\n")}
\`\`\``,
        });
        return {
            code: 0,
            reason: `\`npm publish ${args.join(" ")}\` passed on [${push.repo.owner}/${
                push.repo.name
            }/${push.after.sha.slice(0, 7)}](${push.after.url})`,
        };
    },
};

function gitBranchToNpmTag(branchName: string): string {
    return `branch-${gitBranchToNpmVersion(branchName)}`;
}

const GitTagStep: NpmStep = {
    name: "git tag",
    run: async (ctx, params) => {
        await params.project.spawn("git", ["tag", "-m", `Version ${params.version}`, params.version]);
        await params.project.spawn("git", ["push", "origin", params.version]);
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
            NodeVersionStep,
            NpmInstallStep,
            NpmScriptsStep,
            NpmPublishStep,
            GitTagStep,
        ],
    });
};
