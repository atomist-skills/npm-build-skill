# `atomist/npm-build-skill`

<!---atomist-skill-description:start--->

Run npm scripts to compile or test your JavaScript project

<!---atomist-skill-description:end--->

---

<!---atomist-skill-readme:start--->

# What it's useful for

Run npm scripts with different versions of Node.js and npm in a consistent container environment.
When your tests pass, you can immediately publish the package to the npmjs.com Registry.

-   Set up this skill with multiple configuration to run your tests on different versions of Node.js
-   Decide to publish your packages consistently from a centralized configuration
-   Own the container environment and install tools needed for your build and test

# Before you get started

Connect and configure this integration:

-   **GitHub**
-   **npmjs.com Registry**
-   **Slack or Microsoft Teams**

The **GitHub** integration must be configured in order to use this skill. At least one repository must be selected.
If you want to publish a npm package to npmjs.com, you need to connect an **npmjs.com Registry**. We recommend
that you configure the **Slack** or **Microsoft Teams** integration.

# How to configure

1. **Configure npm scripts to run**

    Provide the name of the npm scripts from the project's `package.json` scripts section.
    The order in which the scripts are specified is the order in which they will get executed.
    If one script fails, the execution stops.

1. **Define Node.js version**

    Provide a valid Node.js version or alias as used by [nvm](https://github.com/nvm-sh/nvm#usage).

1. **Decide if the package should be published after running the scripts**

    When checked, the skill will run `npm publish` after successful execution of the configured
    scripts.

1. **Define package access**

    `npm publish` allows to publish packages with `public` or `restricted` access.

1. **Create additional npm distribution tags**

    Specify additional [distribution tags](https://docs.npmjs.com/adding-dist-tags-to-packages)
    like `next` or `stable` for the published version of the package.

1. **Tag the Git commit on successful execution**

    Tag the Git commit with the version of the packcage that was just published.

1. **Specify an optional bash command**

    In case your npm scripts need different tools - like databases - you can use this parameter
    to install such tools. Provide a command that can in a Ubuntu 20.04 LTS container.

    Here's is an example on how to install MongoDB and start it:

    ```bash
    apt-get update \
        && apt-get install -y wget libcurl4 openssl tar \
        && wget https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu1804-4.2.8.tgz \
        && tar -zxvf mongodb-linux-x86_64-ubuntu1804-4.2.8.tgz \
        && cp mongodb-linux-x86_64-ubuntu1804-4.2.8/bin/* /usr/local/bin/ \
        && rm -rf mongodb-linux-x86_64-ubuntu1804-4.2.8* \
        && mkdir -p /var/lib/mongo \
        && mkdir -p /var/log/mongodb \
        && mongod --dbpath /var/lib/mongo --logpath /var/log/mongodb/mongod.log --fork
    ```

1. **Enable file caching for faster execution times**

    You can speed up executions times by enabling file caching for certain artifacts — for example, dependencies —
    by providing glob patterns of files you'd like to cache between executions.

    Note that only files within the `/atm/home` directory can be cached.

    Caching the npm dependency cache could be accomplished with the following pattern:

    `.npm/**`

1. **Determine repository scope**

    By default, this skill will be enabled for all repositories in all
    organizations you have connected.

    To restrict the organizations or specific repositories on which the skill
    will run, you can explicitly choose organization(s) and repositories.

# How to build and publish your npm projects

1. **Configure at least the npm scripts to run**

1. **Make some pushes to your configured repositories**

1. **Enjoy automatic and consistent execution of npm scripts on every push**

To create feature requests or bug reports, create an [issue in the repository for this skill](https://github.com/atomist-skills/npm-build-skill/issues).
See the [code](https://github.com/atomist-skills/npm-build-skill) for the skill.

<!---atomist-skill-readme:end--->

---

Created by [Atomist][atomist].
Need Help? [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ "Atomist - How Teams Deliver Software"
[slack]: https://join.atomist.com/ "Atomist Community Slack"
