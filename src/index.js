import express from "express";
import "dotenv/config";
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js";
import indexRoutes from "./routes/index.routes.js";
import chatRoutes from "./routes/chat.routes.js"


const app = express();
const port = 3000;

app.use(express.json());
app.use("/api/inngest", serve({ client: inngest, functions }));

app.get('/', (req, res) => {
    res.send('Hello world');
});

app.use("/api/index", indexRoutes);
app.use("/api/chat", chatRoutes);

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});