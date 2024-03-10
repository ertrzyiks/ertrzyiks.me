---
title: How to use Wercker to deploy Ghost on Dokku
permalink: how-to-use-wercker-to-deploy-ghost-on-dokku/
updated: "2017-06-05 19:15:37"
date: 2015-08-22 08:33:54
tags:
  - devops
featured_image: /content/2015/ghost.jpg
---

[Ghost](https://ghost.org/) is a blogging platform and a lightweight alternative to the [Wordpress](https://wordpress.org/). It's written in NodeJS (which we all love), has a markdown-based editor, a very simple admin interface and yet is highly customizable. This make Ghost my platform of choice.

<!-- more -->

My server is a Digital Ocean droplet, but it could be whatever. Important fact is that it has installed only one application: [Dokku](http://progrium.viewdocs.io/dokku/).

## The platform

Dokku is an open source copy of Heroku Platform as a Service. I met it because last months I was playing with Docker itself and Dokku is a great position in the library of examples. Under the hood Dokku uses Docker to isolate applications and additionally allows you to build application environment from a Dockerfile. I've started with Dokku-alt, but right now it seems to be abandoned, so I decided to use the original Dokku version. Both are similar and do the same job: allow you to deploy with git. Main difference is that Dokku-alt contains few useful plugins on fresh installation, on Dokku they must be added manually.

How to start? To use Dokku you need a server with an ssh access. On [documentation page](http://progrium.viewdocs.io/dokku/) or [repository](https://github.com/progrium/dokku) there is one-liner to set it up.

To have an access to deployment and `dokku` user, you need to send your public key from your computer to the server:

```bash
cat ~/.ssh/id_rsa.pub | ssh [sudouser]@[server-address] "sudo sshcommand acl-add dokku [description]"
```

Now you can create an app:

```bash
ssh dokku@<server_address> apps:create my-awesome-app
```

add new remote to your local git repository:

```bash
git remote add dokku dokku@<server-address>:my-awesome-app
```

and push your master there:

```bash
git push dokku master
```

Yay, your own Heroku!

## Continous delivery

After experiments with different CI/CD services I'm happy with [Wercker](http://wercker.com/). You can build and deploy your application, arrange your delivery pipeline using a community driven collection of steps. You can choose docker enabled infrastructure and then use any Docker image from Dockerhub or Quay as environment for your builds.

I came across it by accident. I was looking for a service supporting private repositories for free. I didn't expect much from a free service, what I got was just brilliant. I used a nice form to configure my first project, copied a few lines from examples to my wercker.yml and everything was working. So smooth.

An open environment, where everyone can publish a piece of own solution, encouraged me to do [approval step for pull requests](https://github.com/ertrzyiks/wercker-step-bitbucket-pr-approve) and now the only copy-paste part between projects using Bitbucket is a short entry in configuration file. How cool is that!

## Bind them together

Ah yeah, the blog.

To prepare application for continuous delivery and avoid vendor code in repository, you can use Ghost as an npm package. [Here](https://github.com/TryGhost/Ghost/wiki/Using-Ghost-as-an-npm-module) is the instruction. Finally it's enough to create index file, like this:

```js
var ghost = require("ghost");
var path = require("path");

ghost({
  config: path.join(__dirname, "config.js"),
}).then(function (ghostServer) {
  app.use(ghostServer.rootApp);
  ghostServer.start(app);
});
```

##### Database

Ghost use SQL database for storing page settings and posts. For local preview it's fine to use sqlite3 adapter, for the actual blog it's recommended to use MySQL or Postgresql. I've created a Postgres database server, because I used to MySQL and wanted to try something new. The [postgres plugin](https://github.com/Kloadut/dokku-pg-plugin) for Dokku made this task very simple:

```bash
ssh dokku@<server_address> postgresql:create blog-db
ssh dokku@<server_address> postgresql:link blog-app blog-db
```

After executing those lines `DATABASE_URL` environment variable will be created inside the application, so to get connection we need to pass it to database config section:

```js
database: {
    client: 'postgres',
    connection: process.env.DATABASE_URL
}
```

For MySQL I would use analogous Dokku [plugin](https://github.com/hughfletcher/dokku-mysql-plugin).

I really like the fact whenever I need a better database server, its matter of data migration and changing value of `DATABASE_URL` variable.

##### Upload

Typical problem in the world of automatic deployment is that files created during the life of application are erased with succeeding deployment.

With Dokku you could create a volume - folder shared between the app and the server. Using a volume would preserve files between rebuilds, but another (better?) option is to use external storage, like Amazon S3 or Cloudinary. It's more reliable and easier to migrate.

Before version 0.6 Ghost didn't support us when we decided to use external service for file storage. Currently we can install and configure store addon. Since it's free, I decided to give Cloudinary a chance.

For installation instruction check documentation of chosen adapter. Most likely it will be done by making sure that your production config contains storage section with valid authentication keys, for example:

```js
storage: {
    active: 'ghost-cloudinary-store',
    'ghost-cloudinary-store': {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    }
}
```

Whenever we upload file from admin panel it goes to Cloudinary media library and it's served from there. Upload case closed.

##### Almost there

The last missing piece is push-to-deploy. We need to setup a new Wercker application. During this process webhooks from Github/Bitbucket will be automatically created and the CI service will be notified about any change on branches. It will also generate for us starting wercker.yml with NodeJS environment.

Let's create a custom deploy target. That means we take responsibility for deployment using the `deploy` section of wercker.yml.

Wercker need access to our Dokku server, so we can use the _SSH keys_ section in the application settings. Once you created the key, it needs to be exposed to the deploy job with an environment variable. I've added it to the deploy target settings, but this variable can be added in the _Environment variables_ section as well. Check the "SSH Key pair" in the form and select the key from the list, here:

![](/content/2015/dokku-key.png)

Copy the public key and add it to your server, exactly like you added your own key:

```bash
echo "WERCKER PUBLIC KEY HERE" | ssh [sudouser]@[server-address] "sudo sshcommand acl-add dokku [description]"
```

Additionally, the deploy target can build dokku git url from environment variables. We need the hostname alone to add it to known hosts anyway. Let's put it all together:

```bash
GIT_DEPLOY_APP=<app_name>
GIT_DEPLOY_USER=dokku
GIT_DEPLOY_HOST=<server_address>
```

Now we can use the `deploy` section of wercker.yml to push to master and initiate deployment. The Wercker job will have detached git head during deployment, so we need to use `HEAD:master` as the push target.

```yml
deploy:
  steps:
    - add-to-known_hosts:
        hostname: $GIT_DEPLOY_HOST

    - add-ssh-key:
        keyname: MY_DOKKU_KEY

    - script:
        name: push to dokku
        code: |
          echo "Pushing to: $GIT_DEPLOY_USER@$GIT_DEPLOY_HOST:$GIT_DEPLOY_APP"
          git remote add dokku $GIT_DEPLOY_USER@$GIT_DEPLOY_HOST:$GIT_DEPLOY_APP
          git push dokku HEAD:master -f
```

To test the configuration select the latest green build and click on the Deploy button. The deploy target has an option to automatically trigger deploy after a successful build on given branches. I've used `master` as the deployment branch.

## Looks like it's start

It may be strange to see this title on the bottom of page. We have our blog hosted under Dokku control, using git hooks to deliver new version after few minutes from push to repository. Database server built from Dockerhub image is ready to handle our traffic. Few pictures of cats landed in our S3 bucket or Cloudinary library.

At the end Ghost works with default NodeJS configuration on Dokku, so Dockerfile wasn't neccessary. It may be useful if we decide to add extra functionality, which require additional software. We didn't use any of Docker utilities from Wercker either. Still a lot to explore!

BTW you can explore source code of this blog [on this github repo](https://github.com/ertrzyiks/blog.ertrzyiks.pl).
