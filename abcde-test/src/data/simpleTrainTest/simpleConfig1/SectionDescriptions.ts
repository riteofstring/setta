export default {
  "029d31d8-7280-4203-a383-4b7e067ecdad": {
    value: "## Which Model Should You Use?",
    height: 100,
    visible: true,
  },
  "c61eda2b-92f9-479d-9882-1febcdbdcd87": {
    value: "",
    height: 100,
    visible: false,
  },
  "cbe28b2a-0cfc-45d7-afd3-175d3d8ff15f": {
    value: "",
    height: 100,
    visible: false,
  },
  "9283707a-494a-49d2-bd02-243ca58b7791": {
    value: "",
    height: 100,
    visible: false,
  },
  "a68bccf2-44b1-4e51-bbe1-3a4c209f7e2c": {
    value: "",
    height: 100,
    visible: false,
  },
  "c6c350df-5bda-436c-af2d-408344039314": {
    value: "These parameters are very interesting",
    height: 100,
    visible: false,
  },
  "50598c39-043a-4ded-8999-677bfa3fc204": {
    value: "",
    height: 100,
    visible: false,
  },
  "58e6414c-0675-4051-a34d-48f28dceb8a9": {
    value: "",
    height: 100,
    visible: false,
  },
  "9cc19089-b111-4a5b-8eaf-70e42adc5c01": {
    value: "",
    height: 100,
    visible: false,
  },
  "85c154d4-934f-40ed-906f-6c21e3c1e5ef": {
    value: "",
    height: 100,
    visible: false,
  },
  "1cc2d4ea-0592-4819-be90-0ccd7ad59ca0": {
    value: "",
    height: 100,
    visible: false,
  },
  "0f8fc56f-56c1-455c-bcae-b130658449d5": {
    value: "",
    height: 100,
    visible: false,
  },
  "5ef13e3c-84c6-489c-b68c-851ac9d6f4ae": {
    value: "",
    height: 100,
    visible: false,
  },
  "c9b3bdd8-fc6a-454b-abfc-a8a005570438": {
    value:
      '# git-test -- test your commits\n\nRun tests on each *distinct* tree in a revision list, skipping versions whose\ncontents have already been tested.\n\nThe 99% example is simply:\n\n    git test -v\n\nBy default it uses heuristics to try to determine what "local commits" to\ntest, but you can supply another ref spec. `git-test` looks at each commit and\nchecks the hash of the directory tree against the cache. You can also configure\na ref (usually a branch) to test against, per repo or or per branch.\n\nFrom the point of view of `git-test`, a test can be any shell command and a\ntest is considered successful if that shell command returns with a `0` exit\nstatus. This means `git-test` can be used both for specialised tests of a\nsingle feature or failure mode or for running a comprehensive set of automated\ntests. The cache is keyed on both directory tree and test, so it won\'t confuse\nthe unit tests with the integration tests, or a specific regression test.\n\n## Motivation\n\nAn important design goal for `git-test` has been to make it convenient to use.\n\nIdeally, you should have a work flow where you run your unit tests whenever\nyou save and run unit tests on all your local commits whenever you\'ve done\nsomething with version control.\n\nFor ease, `git-test` offers a few advantages over a simple for loop over a\n`git rev-list`:\n\n- By default it spends some effort on working out which commits to test.\n- Cached results, which are keyed to tree contents, rather than commit. This\n  means that commits can be amended or reordered, but only content trees that\n  have never been tested before will be tested.\n- Separate pre- and post-action hooks, the results of which don\'t actually\n  factor into the test result. (Useful if cleaning fails if there is nothing\n  to clean, for instance.)\n- Configuration of housekeeping and verification steps using\n    - `git config`,\n    - environment variables or\n    - command line arguments\n- Selective redo, for where you trust failures but not successes, vice versa,\n  or trust nothing.\n- Save output (both `STDOUT` and `STDERR`) from cleaning and verifying to\n  an easily referenced symlink farm.\n\n\n## Configure\n\nMostly just this:\n\n    git config test.verify "test command that returns nonzero on fail"\n\nto default to testing against origin/master:\n\n    git config test.branch origin/master\n\nto do the same, but for a single branch:\n\n    git config branch.mybranch.test parentbranch\n\n\n## Self-Test\n\nTo try the test script with different shells:\n\n    for sh in /bin/dash /bin/bash /bin/ksh /bin/mksh /bin/pdksh; do\n        echo $sh\n        sh test.sh -s $sh\n    done\n\nNote that since version 1.0.2, the shebang is set to `/bin/bash`. Other shells\nare now supported on a "patches welcome" basis. (This is largely because I\ncouldn\'t find a shell I could run in my GNU/Linux environment that behaves\nlike the OS X (FreeBSD?) `sh` shell, which has very different behaviour from\nall the others.)\n\nTo regression test properly:\n\n    rev=$(git rev-parse --short HEAD)\n    cp test.sh regressions_${rev}.sh\n    GIT_TEST_VERIFY="sh regressions_${rev}.sh" git test -v\n\n(The reason for copying the script is to test each commit against the new\ntests, and the reason for naming it based on the current commit is to key the\ncache correctly.)\n\n\n## Installation\n\nYou can just have the `git-test` script in your `PATH`, but there are other\noptions:\n\n### Homebrew (on OS X)\n\nIf you have [Homebrew](http://brew.sh) installed, you can install\n`git-test` with:\n\n    $ brew install git-test\n\n### From source\n\nAside from the packaging, you can also install from source. It\'s a single\nPOSIX shell script that uses core git, so all that\'s required for plain `git\ntest` to work (besides git, of course) is that `git-test` needs to be\nsomewhere in your `PATH` (or `GIT_EXEC_PATH`).\n\nYou can install from source by doing the following:\n\n    $ install git-test   /usr/local/bin\n    $ install git-test.1 /usr/local/share/man1\n\nOr just add this directory to your `PATH` environment variable.\n\n### Debian GNU/Linux\n\nThe usual\n\n    $ fakeroot debian/rules binary\n\nShould give you a Debian package.\n\n### Arch Linux\n\nWith Arch Linux, you can use the provided `PKGBUILD` file. Simply download the\nfile and run `makepkg` in the same directory as the file. It will always build\nthe latest `git` version of this package, even if you have an old checkout.',
    height: 500,
    visible: false,
  },
};
