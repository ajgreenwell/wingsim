---
name: create-implementation-plan
description: Use this skill to transform a user-provided spec into an implementation plan.
---


Study the user provided spec and break it down into a kanban-style list of implementation steps? The ordering of the steps shouldn't be specified, but they should be cleanly defined into distinct chunks of work. Each chunk should be completable well within a single context window (150k tokens, or so). Don't make them overly granular, but logically grouped. Put together, when all tasks are complete, the spec should be fully implemented without any gaps. Double check the plan at the end against the spec to make sure this is the case. Make sure each task in the plan has a corresponding checkbox for tracking completion. Output the plan to .claude/specs/(Insert Spec Name Prefix)Plan.md