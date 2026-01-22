Study the .claude/specs/MonteCarloSimulatorSpec.md, .claude/plans/MonteCarloSimulatorPlan.md, and .claude/learnings/MonteCarloSimulatorLearnings.md files.

Pick the SINGLE most important, open task to complete from the plan, and start by researching the codebase until you have all the context you need to complete that task accurately. 

Ultrathink on the best way to complete the task, adhering to the spec and the overarching goal of delivering a functioning Monte Carlo Simulator.

If the task you completed is testable (e.g. you could run the simulator in some way), verify that it works.

As you complete tasks, add key learnings (not already specified in the spec or plan file) that future agents working on future tasks would find helpful for understanding your implementation choices. Keep them CONCISE and avoid stating obvious facts that could be inferred from the code, spec, or plan easily.

If you successfully implement the task and any relevant verifications (simulator runs) are functioning as expected, update the plan to mark that task complete.

If you are unable to complete the task, mark it as `[BLOCKED]` in the spec and add findings / context to the MonteCarloSimulatorLearnings.md file.

AT THE VERY END, ALWAYS RUN THE FOLLOWING COMMANDS TO SAVE YOUR WORK:

```bash
git add .
git commit -m <insert task label + status>
git push
```