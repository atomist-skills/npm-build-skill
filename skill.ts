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

import { parameter, ParameterType, resourceProvider, skill } from "@atomist/skill";
import { Configuration } from "./lib/configuration";

export const Skill = skill<Configuration & { repos: any }>({
    name: "npm-skill",
    namespace: "atomist",
    displayName: "NPM",
    author: "atomist-skills",
    categories: [],
    license: "Apache-2.0",
    homepageUrl: "https://github.com/atomist-skills/npm-skill",
    repositoryUrl: "https://github.com/atomist-skills/npm-skill.git",
    iconUrl: "file://docs/images/icon.svg",

    runtime: {
        memory: 2048,
        timeout: 540,
    },

    resourceProviders: {
        github: resourceProvider.gitHub({ minRequired: 1 }),
        chat: resourceProvider.chat({ minRequired: 0 }),
    },

    parameters: {
        world: {
            type: ParameterType.String,
            displayName: "World",
            description: "",
            required: false,
        },
        repos: parameter.repoFilter(),
    },

    commands: [
        {
            name: "helloWorld",
            displayName: "HelloWorld",
            pattern: /^hello world$/,
            description: "Simple hello world command",
        },
    ],

    subscriptions: ["file://graphql/subscription/*.graphql"],
});
