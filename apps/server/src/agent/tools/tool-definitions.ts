import { askQuestionTool } from './ask_question.js'
import { bashTool } from './bash.js'
import { delegateTool } from './delegate.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'
import { manageKanbanTool } from './manage_kanban.js'
import { planExitTool, readPlanTool, writePlanTool } from './manage_plans.js'
import { manageTodosTool } from './manage_todos.js'
import { readFileTool } from './read.js'
import { saveMemoryTool } from './save_memory.js'
import { searchMemoriesTool } from './search_memories.js'
import { strReplaceTool } from './str-replace.js'
import { treeTool } from './tree.js'
import { writeFileTool } from './write.js'

export const tools = {
  bash: bashTool,
  read_file: readFileTool,
  glob: globTool,
  grep: grepTool,
  tree: treeTool,
  str_replace: strReplaceTool,
  write_file: writeFileTool,
  ask_question: askQuestionTool,
  delegate: delegateTool,
  save_memory: saveMemoryTool,
  search_memories: searchMemoriesTool,
  manage_todos: manageTodosTool,
  manage_kanban: manageKanbanTool,
  write_plan: writePlanTool,
  read_plan: readPlanTool,
  plan_exit: planExitTool,
}

export type ToolName = keyof typeof tools
