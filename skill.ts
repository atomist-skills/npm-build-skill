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

import { Category, parameter, ParameterType, resourceProvider, skill } from "@atomist/skill";
import { Configuration } from "./lib/configuration";

export const Skill = skill<Configuration & { repos: any }>({
    name: "npm-skill",
    namespace: "atomist",
    displayName: "npm Scripts",
    author: "Atomist",
    categories: [Category.DevEx],
    license: "Apache-2.0",
    homepageUrl: "https://github.com/atomist-skills/npm-skill",
    repositoryUrl: "https://github.com/atomist-skills/npm-skill.git",
    iconUrl: "file://docs/images/icon.svg",

    resourceProviders: {
        github: resourceProvider.gitHub({ minRequired: 1 }),
        chat: resourceProvider.chat({ minRequired: 0 }),
        npmjs: {
            displayName: "npmjs registry",
            description: "",
            typeName: "NpmJSRegistryProvider",
            minRequired: 0,
            maxAllowed: 1,
        },
    },

    containers: {
        npm: {
            image: "gcr.io/atomist-container-skills/npm-skill",
        },
    },

    parameters: {
        version: {
            type: ParameterType.String,
            displayName: "Node.js version",
            description: "Version of Node.js to install (should be valid nvm alias or version)",
            required: false,
        },
        scripts: {
            type: ParameterType.StringArray,
            displayName: "npm scripts",
            description: "Provide name of npm scripts to run in order",
            required: true,
        },
        publish: {
            type: ParameterType.Boolean,
            displayName: "Publish package",
            description: "Publish npm package to registry once all scripts successfully executed",
            required: false,
        },
        access: {
            type: ParameterType.SingleChoice,
            displayName: "Package access",
            description: "Publish package with public or restricted access",
            options: [
                {
                    text: "Public",
                    value: "public",
                },
                {
                    text: "Restricted",
                    value: "restricted",
                },
            ],
            required: false,
        },
        tag: {
            type: ParameterType.StringArray,
            displayName: "Distribution tags",
            description:
                "Register the published package with the given tags. If no tag is set here, the package will get published with a branch specific tag, e.g. `branch-<name of branch>`.",
            required: false,
        },
        gitTag: {
            type: ParameterType.Boolean,
            displayName: "Git tag",
            description: "Create a Git tag using the `package.json` version",
            required: false,
        },
        docker_cache: {
            type: ParameterType.StringArray,
            displayName: "Cache files or folders",
            description: "Cache and restore file system content between executions of this skill",
            required: false,
        },
        repos: parameter.repoFilter(),
    },

    subscriptions: ["file://graphql/subscription/*.graphql"],
});
