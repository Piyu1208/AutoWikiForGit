import { inngest } from "../client.js";
import { askQuestion } from "../../services/rag.js";


export const askQuestionFn = inngest.createFunction(
    { id: "ask-question", triggers: [{ event: "chat/question.requested" }] },
    async ({ event, step }) => {
      const { repo, question, history = [] } = event.data;
  
    
      try {
        const result = await step.run("retrieve-and-answer", async () => {
          return askQuestion(repo, question, history);
        });
  
    
        return {
          repo,
          question,
          status: "completed",
          answer: result.answer,
          sources: result.sources,
        };
      } catch (error) {
        throw error;
      }
    },
  );