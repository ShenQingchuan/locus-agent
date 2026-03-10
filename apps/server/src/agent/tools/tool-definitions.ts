import { BuiltinTool } from '@locus-agent/agent-sdk'
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
import { skillTool } from './skill.js'
import { strReplaceTool } from './str-replace.js'
import { treeTool } from './tree.js'
import { writeFileTool } from './write.js'

export const tools = {
  [BuiltinTool.Bash]: bashTool,
  [BuiltinTool.ReadFile]: readFileTool,
  [BuiltinTool.Glob]: globTool,
  [BuiltinTool.Grep]: grepTool,
  [BuiltinTool.Tree]: treeTool,
  [BuiltinTool.StrReplace]: strReplaceTool,
  [BuiltinTool.WriteFile]: writeFileTool,
  [BuiltinTool.AskQuestion]: askQuestionTool,
  [BuiltinTool.Delegate]: delegateTool,
  [BuiltinTool.SaveMemory]: saveMemoryTool,
  [BuiltinTool.SearchMemories]: searchMemoriesTool,
  [BuiltinTool.Skill]: skillTool,
  [BuiltinTool.ManageTodos]: manageTodosTool,
  [BuiltinTool.ManageKanban]: manageKanbanTool,
  [BuiltinTool.WritePlan]: writePlanTool,
  [BuiltinTool.ReadPlan]: readPlanTool,
  [BuiltinTool.PlanExit]: planExitTool,
}

export type ToolName = keyof typeof tools
