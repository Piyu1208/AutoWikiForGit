import { inngest } from "./client.js";
import { processTask } from "./functions/exampleFunction.js";

export { inngest }

export const functions = [processTask];
