Study the .claude/specs/ScenarioTestSpec.md, .claude/plans/ScenarioTestPlan.md, and .claude/learnings/ScenarioTestLearnings.md files.

Pick the SINGLE most important, open task to complete from the plan (not necessarily the first incomplete one), and start by researching the codebase until you have all the context you need to complete that task accurately. 

Ultrathink on the best way to complete the task, adhering to the spec and the overarching goal of delivering a functioning Scenario Test Suite.

If the task you completed is testable (e.g. you implemented a scenario test), run that test to make sure it passes.

As you complete tasks, add key learnings (not already specified in the spec or plan file) that future agents working on future tasks would find helpful for understanding your implementation choices. Keep them CONCISE and avoid stating obvious facts that could be inferred from the code, spec, or plan easily.

If you successfully implement the task and any relevant scenario tests you run are passing, update the plan to mark that task complete.

If you are unable to complete the task or can't get any relevant scenario tests to pass after substantial effort, mark it as `[BLOCKED]` in the spec and add findings / context to the ScenarioTestLearnings.md file.

AT THE VERY END, ALWAYS RUN THE FOLLOWING COMMANDS TO SAVE YOUR WORK:

```bash
git add .
git commit -m <insert task label + status>
git push
```
