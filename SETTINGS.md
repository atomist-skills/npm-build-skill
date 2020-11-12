## Before you get started

Connect and configure these integrations:

1.  [**GitHub**](https://go.atomist.com/catalog/integration/github "GitHub Integration")
    _(required)_
1.  [**npm Registry**](https://go.atomist.com/catalog/integration/npmjs-registry "npm Registry Integration")
    _(optional)_

## How to configure

1.  **NPM Registry**

    ![npm registry](docs/images/npm-registry.png)

    Select the npm registry from the list of available registries. If you have
    not already configured an npm registry, only your GitHub organizations, via
    the GitHub Packages npm registry, will appear in the list.

1.  **Triggers**

    ![Event triggers for skill](docs/images/trigger.png)

    Select the events that will trigger execution of the skill. You can select
    GitHub pushes, GitHub tags, or both.

1.  **npm scripts to run**

    ![npm scripts to run](docs/images/scripts.png)

    Provide the name of the npm scripts from the project's `package.json`
    scripts section. This can be useful if you package needs compiled, tested,
    or otherwise transformed before being published. Only provide the name of
    the script, not the full `npm run SCRIPT` command. The order in which the
    scripts are specified is the order in which they will get executed. If one
    script fails, the execution stops. Scripts are run using
    `npm run --if-present SCRIPT`, so it is safe to include scripts that are
    only present in some of your packages.

1.  **Node.js version**

    ![Node.js version](docs/images/node-version.png)

    Provide a valid Node.js version or alias as used by
    [nvm](https://github.com/nvm-sh/nvm#usage), e.g., `12.3.1` or `14`.

1.  **Publish package**

    ![Publish package](docs/images/publish.png)

    When checked, the skill will run `npm publish` after successful execution of
    the configured scripts. This will create the package and publish it to the
    configured npm registry. If not checked, the package will not be published.

    _You must have an npm registry configured to publish packages._

1.  **Package access**

    ![Package access](docs/images/access.png)

    `npm publish` allows to publish packages with `public` or `restricted`
    access.

1.  **Create additional npm distribution tags**

    ![Package dist tags](docs/images/tags.png)

    Specify additional [distribution tags][dist-tag] like `next` or `stable` for
    the published version of the package. In addition to the tags you specify
    here, if the skill is running on the default branch, it adds the `next` tag.
    Similarly, if the skill is running on a git tag that looks like a release
    [semantic version][semver], the `latest` tag is added, making the published
    version the new default.

1.  **Specify an optional bash command**

    ![Shell command](docs/images/shell-command.png)

    In case your npm scripts need different tools - like databases - you can use
    this parameter to install such tools. Provide a command that can in a Ubuntu
    20.04 LTS container. This command is after the code is checked out but
    before Node.js is setup or any npm commands are run.

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

1.  **Enable file caching for faster execution times**

    ![Skill file caching](docs/images/cache.png)

    You can speed up executions times by enabling file caching for certain
    artifacts — for example, dependencies — by providing glob patterns of files
    you'd like to cache between executions.

    Note that only files within the `/atm/home` directory can be cached.

    Caching the npm dependency cache could be accomplished with the pattern
    `.npm/**/*`.

1.  **Determine repository scope**

    ![Repository filter](docs/images/repo-filter.png)

    By default, this skill will be enabled for all repositories in all
    organizations you have connected.

    To restrict the organizations or specific repositories on which the skill
    will run, you can explicitly choose organizations and repositories.

1.  **Activate the skill**

    Save your configuration and activate the skill by clicking the "Enable
    skill" button.

[dist-tag]: https://docs.npmjs.com/adding-dist-tags-to-packages "npm dist-tags"
[semver]: https://semver.org/ "Semantic Versioning"
