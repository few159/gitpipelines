# Change Log

All notable changes to the "gitpipelines" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.2.1] - 2026-09-03

- Suggest a work item ID from `<prefix>/<WI-ID>-description` branch names, regardless of prefix.
- Support comma-separated work item IDs, with validation and deduplication.
- Ask about an additional PR only when a saved pipeline sets `askForAdditionalPr` to `true`; default to no prompt.
- Remove the additional PR prompt from one-off Single Pipeline runs.

## Earlier releases

- Add pipeline creation workflow for Azure DevOps branches.
- Add pipeline execution to open PRs from current branch to all pipeline targets.
- Store pipelines locally and use VS Code secret storage for PATs.
