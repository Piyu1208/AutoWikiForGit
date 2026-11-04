import { inngest } from "./client.js";
import { processTask } from "./functions/exampleFunction.js";
import { indexRepo } from "./functions/indexRepo.js";
import { askQuestionFn } from "./functions/askQuestion.js";

export { inngest }

export const functions = [processTask, indexRepo, askQuestionFn];
