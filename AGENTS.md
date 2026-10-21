# Recruitment Intelligence — development workflow

## Scope and authorization

The user requests that GitHub be updated after every development task, without asking again for routine commits and pushes. Canonical repository: Easygoingdude/recruitment-intelligence-v12, branch main. Hosted Sites project: appgprj_6ad5dccbb9048191a5490c8054dd89a8. Application source belongs in site/; preserve plugin/ and recovery/.

## Before editing

Read these instructions and any more specific AGENTS.md. Read the latest main branch and inspect the current Sites source when working on the hosted application. Do not assume an old checkout or the GitHub snapshot equals the current live source. Preserve unrelated user changes. The user reports that the recovery branch was already merged; do not repeat that merge as routine setup.

## Required completion steps

1. Finish the requested changes and run checks appropriate to their scope.
2. Review the diff. Exclude credentials, .env files, candidate data, uploaded resumes, database exports, node_modules, runtime caches and generated deployment bundles. Preserve tracked configuration and dependency lockfiles. Never include tokens in Git remotes or logs.
3. For hosted changes, follow the Sites skill for source synchronization and publication, preserving the project identity and audience. Mirror the exact final application source to site/ in this GitHub repository; preserve repository-only files and recovery evidence. Verify new files and intentional deletions as well as modifications. Never overwrite a newer GitHub or Sites change blindly.
4. Commit the task changes with a descriptive message and push to main using the authorized GitHub connection. With branch protection, use a branch and pull request and explicitly report its status. Do not force-push. Resolve concurrent changes without discarding others' work.
5. Read back the resulting GitHub ref/files to verify the remote contains the intended changes. For hosted tasks verify the published source corresponds to the mirrored source.
6. Report the result briefly, with the GitHub commit link and any deployment or verification limitation. Do not claim the task is fully synchronized if a push failed. Report the concrete blocker and retain recoverable work.

This is an agent development workflow, not an installed background sync service. Changes made outside a development session that reads this repository are not automatically detected. Do not claim that a webhook, scheduled job or native Sites-to-GitHub integration exists unless it has actually been configured and verified.
