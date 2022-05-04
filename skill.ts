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

import {
	Category,
	LineStyle,
	parameter,
	ParameterType,
	ParameterVisibility,
	skill,
} from "@atomist/skill";

import { Configuration } from "./lib/configuration";

export const Skill = skill<
	Configuration & { repos: any; subscription_filter: any; ref_filter: any }
>({
	description: "Run npm scripts to compile or test your JavaScript project",
	displayName: "npm Build",
	categories: [Category.DevOps],
	iconUrl:
		"https://raw.githubusercontent.com/atomist-skills/npm-build-skill/main/docs/images/icon.svg",

	containers: {
		npm: {
			image: "gcr.io/atomist-container-skills/npm-build-skill",
		},
	},

	parameters: {
		subscription_filter: {
			type: ParameterType.MultiChoice,
			displayName: "Triggers",
			description: "Select one or more trigger for this skill",
			options: [
				{
					text: "GitHub > push",
					value: "onPush",
				},
				{
					text: "GitHub > tag",
					value: "onTag",
				},
			],
			defaultValues: ["onPush"],
			required: true,
		},
		scripts: {
			type: ParameterType.StringArray,
			displayName: "npm scripts",
			description: "Provide name of npm scripts to run in order",
			required: false,
		},
		version: {
			type: ParameterType.String,
			displayName: "Node.js version",
			description:
				"Version of Node.js to install (should be a valid Node.js version or [nvm alias](https://github.com/nvm-sh/nvm#usage))",
			placeHolder: "lts",
			defaultValue: "lts",
			required: false,
		},
		publish: {
			type: ParameterType.SingleChoice,
			displayName: "Publish package",
			description:
				"Publish npm package to registry once all scripts successfully executed",
			options: [
				{ text: "No", value: "no" },
				{ text: "Default branch only", value: "default" },
				{ text: "All branches", value: "all" },
			],
			defaultValue: "no",
			required: true,
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
		npmrc: {
			type: ParameterType.Secret,
			displayName: ".npmrc file",
			description: "Contents of .npmrc file to be used for publishing",
			required: false,
		},
		tag: {
			type: ParameterType.StringArray,
			displayName: "Distribution tags",
			description:
				"Register the published package with the given tags. If no tag is set here, the package will get published with a branch specific tag, e.g. `branch-<name of branch>`.",
			required: false,
		},
		ref_filter: {
			...parameter.refFilter(),
			visibility: ParameterVisibility.Advanced,
		},
		command: {
			type: ParameterType.String,
			displayName: "Shell command",
			description:
				"Specify a shell command to be executed with `bash -c` on a Ubuntu-based environment to set up needed tools for your npm scripts",
			lineStyle: LineStyle.Multiple,
			required: false,
			visibility: ParameterVisibility.Advanced,
		},
		docker_cache: {
			type: ParameterType.StringArray,
			displayName: "Cache files or folders",
			description:
				"Cache and restore file system content between executions of this skill",
			required: false,
			visibility: ParameterVisibility.Advanced,
		},
		repos: parameter.repoFilter(),
	},

	datalogSubscriptions: [
		{ name: "on_push", query: "@atomist/skill/on_push" },
	],
});
