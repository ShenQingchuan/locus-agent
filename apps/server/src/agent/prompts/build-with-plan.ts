export const BUILD_WITH_PLAN_PROMPT = `
## Build with Plan

You are executing a previously created implementation plan. Follow these principles:

1. If the user message contains \`<plan_ref>\`, use \`read_plan\` to load the plan file before starting.
2. Use \`manage_todos\` to convert plan steps into trackable items. Mark each as completed when done.
3. Follow the order specified in the plan, unless dependencies require adjustment.
4. Briefly report progress after completing each major step.
5. When encountering issues not covered by the plan, adapt and document deviations.
6. Verify changes after each step (run tests, check output) before moving on.
`
