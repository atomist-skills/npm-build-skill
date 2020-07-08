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
    Step,
    secret,
    repository,
    project,
    runSteps,
    StepListener,
    HandlerStatus,
    github,
} from "@atomist/skill";
import { Configuration } from "../configuration";
import { BuildOnPushSubscription } from "../typings/types";
import * as fs from "fs-extra";
import * as df from "dateformat";

interface NpmParameters {
    project: project.Project;
    version: string;
    check: github.Check;
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

const SetupNodeStep: NpmStep = {
    name: "setup node",
    run: async (ctx, params) => {
        const cfg = ctx.configuration?.[0]?.parameters;
        // Set up node version
        const result = await params.project.spawn("nvm", ["install", cfg.version]);
        return {
            code: result.status,
        };
    },
};

const NodeVersionStep: NpmStep = {
    name: "version",
    run: async (ctx, params) => {
        const pj = await fs.readJson(params.project.path("package.json"));
        const branch = ctx.data.Push[0].branch.split("/").join(".");
        const branchSuffix = `${branch}.`;

        let pjVersion = pj.version;
        if (!pjVersion || pjVersion.length === 0) {
            pjVersion = "0.0.1";
        }

        const version = `${pjVersion}-${gitBranchToNpmVersion(branchSuffix)}${formatDate()}`;
        params.version = version;
        const result = await params.project.spawn("npm", ["version", "--no-git-tag-version", version]);
        return {
            code: result.status,
        };
    },
};

function gitBranchToNpmVersion(branchName: string): string {
    return branchName.replace(/\//g, "-").replace(/_/g, "-").replace(/@/g, "");
}

function formatDate(date = new Date(), format = "yyyymmddHHMMss", utc = true) {
    return df(date, format, utc);
}

const NpmInstallStep: NpmStep = {
    name: "npm install",
    run: async (ctx, params) => {
        const opts = { env: { ...process.env, NODE_ENV: "development" } };
        let result;
        if (await fs.pathExists(params.project.path("package-lock.json"))) {
            result = await params.project.spawn("npm", ["ci"], opts);
        } else {
            result = await params.project.spawn("npm", ["install"], opts);
        }

        return {
            code: result.status,
        };
    },
};

const NodeScriptsStep: NpmStep = {
    name: "npm run",
    run: async (ctx, params) => {
        const cfg = ctx.configuration?.[0]?.parameters;
        const scripts = cfg.scripts;
        // Run scripts
        for (const script of scripts) {
            const result = await params.project.spawn("npm", ["run", "--if-present", script]);
            if (result.status !== 0) {
                return {
                    code: result.status,
                };
            }
        }
        return {
            code: 0,
        };
    },
};

export const handler: EventHandler<BuildOnPushSubscription, Configuration> = async ctx => {
    return runSteps({
        context: ctx,
        steps: [LoadProjectStep, ValidateStep, SetupNodeStep, NodeVersionStep, NpmInstallStep, NodeScriptsStep],
        listeners: [checkListener],
    });
};
